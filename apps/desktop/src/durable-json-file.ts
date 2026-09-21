/**
 * @file The ONE implementation of how this app keeps a small JSON file in `userData`: atomic
 * replacement, a read that tells "damaged" apart from "empty", moving a damaged file aside instead of
 * writing over it, and a lock for the read-modify-writes that several processes do to one shared file.
 *
 * Extracted 2026-09-20 from `site-process-registry.ts`, which had just grown the first three of those,
 * when the same data-loss bug was found in two more stores: `tracked-sites.ts`
 * (`desktop-projects.json`, every card on the Projects screen) and `site-dir-store.ts`
 * (`desktop-state.json`, the recent-sites list). Each wrote with a plain `writeFileSync`, so a crash
 * partway through left a torn file; each read a torn file back as EMPTY; and the next write then
 * persisted that empty state, erasing the lot. Three private copies of the same few lines is how they
 * came to differ in the first place, so all three stores now call this module and nothing else.
 *
 * **What this module does NOT decide: policy.** Whether an unreadable file is salvaged, restarted
 * from empty, or left for its owner, and whether a failure to move it aside refuses the change or
 * merely skips it, differs per store and belongs with the store. This module supplies the mechanism
 * and a common message so the operator sees one voice on stderr.
 *
 * No `electron` import: this runs in the Electron main process, in `bin/tovu-desktop.ts` (the CLI),
 * in `bin/mcp-bridge.ts`, and under plain `node --test`.
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * What {@link readJsonFile} found. `unreadable` is deliberately its own state and never folded into
 * an empty value: an empty list is a valid file, while an unreadable one holds records nobody can
 * know. Folding the two together is exactly how a torn file was read as `[]` and the next write
 * persisted that.
 *
 * `text` carries the bytes when they were read but are not JSON, for a store that salvages what it
 * can ({@link salvageJsonPrefix}); it is absent when the read itself failed and there are no bytes.
 */
type JsonFileRead = { state: "ok"; value: unknown } | { state: "missing" } | { state: "unreadable"; text?: string };

/** How a {@link quarantineUnreadableFile} message names the file and what its loss costs. */
interface QuarantineNotice {
  /** What this file is, in the operator's terms — "projects list", "site-process registry file". */
  label: string;
  /** One sentence completing "Moved it aside to <path>; …". */
  consequence: string;
}

/** {@link withFileLock}'s own options. */
interface FileLockOptions {
  /** How long to wait for another process's lock. Defaults to {@link LOCK_WAIT_MS}; tests pass less. */
  waitMs?: number;
}

/** How long {@link withFileLock} waits before giving up. A lock is only ever held across one
 *  synchronous read-modify-write — milliseconds — so reaching this means the holder is wedged, not
 *  busy, and the caller is better off told than blocked. */
const LOCK_WAIT_MS = 5_000;

/** How long to wait between attempts. Short because the critical sections are short. */
const LOCK_POLL_MS = 10;

/** A lock this old is abandoned even when its pid still names a live process: the OS may have
 *  recycled that pid after the holder crashed, and no live holder takes this long over a synchronous
 *  write. Without it, one recycled pid would wedge the file until that unrelated process exited. */
const LOCK_STALE_MS = 30_000;

/** Bounds {@link salvageJsonPrefix}'s parse attempts, so salvaging a large damaged file costs
 *  bounded time rather than one parse per quoted character in it. */
const MAX_SALVAGE_ATTEMPTS = 1_000;

/** One shared cell, only ever used to park this thread in {@link sleepSync}. */
const SLEEP_CELL = new Int32Array(new SharedArrayBuffer(4));

/**
 * Read and parse one JSON file, reporting missing and unreadable as the distinct things they are.
 * @complexity O(n) in file size.
 */
function readJsonFile(filePath: string): JsonFileRead {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? { state: "missing" } : { state: "unreadable" };
  }
  try {
    return { state: "ok", value: JSON.parse(text) as unknown };
  } catch {
    return { state: "unreadable", text };
  }
}

/**
 * Where {@link writeJsonFileAtomic} builds the new file before renaming it over the real one:
 * `<file>.<pid>.tmp`, the convention `site-config.ts` and `site-preview-store.ts` already use.
 *
 * Named per PROCESS rather than per file, because a shared file has several writer processes: on one
 * fixed temp name, one writer could truncate the temp another writer is about to rename into place —
 * a torn file again, by a different route. One process cannot collide with itself, since every write
 * here is synchronous. A crash leaves the temp behind; that pid's next write truncates it.
 *
 * @param pid whose temp file. Defaults to this process's; `site-process-registry.ts` passes a dead
 *   instance's owner pid to clean up after it.
 * @complexity O(1).
 */
function tempPathFor(filePath: string, pid: number = process.pid): string {
  return `${filePath}.${pid}.tmp`;
}

/**
 * Atomically replace `filePath` with `value` as pretty-printed JSON: write a sibling temp file,
 * `fsync` it, then `rename` it over the target. A rename within one directory is atomic, so a reader
 * — or the next boot after a crash at ANY point in here — sees either the complete old file or the
 * complete new one, never a torn one. The `fsync` is what makes that true after a power loss rather
 * than only after a process crash: without it the rename can reach the disk before the bytes do.
 *
 * @complexity O(n) in the serialized size.
 */
function writeJsonFileAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = tempPathFor(filePath);
  const fd = fs.openSync(tempPath, "w");
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
}

/**
 * Move an unreadable file aside to `<file>.corrupt-<ms>` — preserved for inspection, never
 * overwritten or deleted — and say so on stderr, since whatever it held is no longer in play.
 *
 * @returns whether the path is now clear to write. `true` also when the file is already gone (a
 *   concurrent process moved it first). `false` when it could not be moved: the caller must then
 *   leave it alone rather than write over it.
 * @complexity O(1); one rename.
 */
function quarantineUnreadableFile(filePath: string, notice: QuarantineNotice): boolean {
  const asidePath = `${filePath}.corrupt-${Date.now()}`;
  try {
    fs.renameSync(filePath, asidePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    console.error(`tovu desktop: ${notice.label} ${filePath} is unreadable and could not be moved aside (${String(error)}). Left untouched; nothing was written over it.`);
    return false;
  }
  console.error(`tovu desktop: ${notice.label} ${filePath} was unreadable (torn or corrupt). Moved it aside to ${asidePath}; ${notice.consequence}`);
  return true;
}

/**
 * Run `critical` holding an exclusive `<file>.lock`, so a read-modify-write of a file SEVERAL
 * PROCESSES share cannot lose another process's change.
 *
 * Needed because multi-instance is the normal case here — the owner runs several desktop windows on
 * purpose and has ruled out `requestSingleInstanceLock`, and `bin/tovu-desktop.ts` and
 * `bin/mcp-bridge.ts` edit the projects list from their own processes. Two unlocked read-modify-writes
 * over one file lose whichever change was read before the other was written; `site-process-registry.ts`
 * escapes that by giving each instance its own file, which is right for crash-recovery rows an
 * instance owns and wrong for a list the operator expects every window to agree about.
 *
 * Only read-modify-write needs this. Plain READS need nothing: {@link writeJsonFileAtomic} means a
 * reader always sees one whole version.
 *
 * Not re-entrant, deliberately: a nested call would block until it times out, which is loud, where
 * silently letting it through would hand two nested critical sections the same "exclusive" file.
 * Compose store functions out of unlocked internals instead — see `tracked-sites.ts`.
 *
 * @throws {Error} when the lock is still held after `options.waitMs`, or when the lock file cannot be
 *   created at all (an unwritable directory, which would fail the write that follows anyway).
 * @complexity O(1) plus the wait; `critical`'s own cost dominates.
 */
function withFileLock<T>(filePath: string, critical: () => T, options: FileLockOptions = {}): T {
  const lockPath = `${filePath}.lock`;
  const token = `${process.pid}:${randomBytes(4).toString("hex")}`;
  acquireLock(lockPath, token, options.waitMs ?? LOCK_WAIT_MS);
  try {
    return critical();
  } finally {
    releaseLock(lockPath, token);
  }
}

/**
 * Block until this process holds `lockPath`, breaking one nobody can still be holding.
 * @complexity O(waitMs / LOCK_POLL_MS) attempts in the worst case.
 */
function acquireLock(lockPath: string, token: string, waitMs: number): void {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + waitMs;
  while (!tryCreateLock(lockPath, token)) {
    if (isAbandonedLock(lockPath)) {
      fs.rmSync(lockPath, { force: true });
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(`tovu desktop: ${lockPath} is still held by another Tovu process after ${waitMs}ms, so this change was not saved. Nothing was written over. Try again, or quit the other Tovu window.`);
    }
    sleepSync(LOCK_POLL_MS);
  }
}

/**
 * One attempt to claim the lock. `wx` is create-or-fail, which is the whole mechanism: the kernel
 * decides who wins, not a check-then-create this code could lose a race inside.
 *
 * @returns whether this process now holds it. `false` means someone else does.
 * @complexity O(1).
 */
function tryCreateLock(lockPath: string, token: string): boolean {
  let fd: number;
  try {
    fd = fs.openSync(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    // The token, not just the pid: {@link releaseLock} uses it to be sure it is deleting its OWN lock
    // and not one a later process took after this one's was broken as abandoned.
    fs.writeSync(fd, token);
  } catch (error) {
    // A lock nobody can identify would wedge the file for LOCK_STALE_MS. Take it back out.
    fs.rmSync(lockPath, { force: true });
    throw error;
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

/**
 * Whether a held lock can be broken: its owner is gone, or it is too old for any live owner to still
 * be inside a synchronous write (see {@link LOCK_STALE_MS}).
 *
 * The residual race, stated rather than hidden: two processes that judge the SAME abandoned lock in
 * the same instant can both break it and both proceed. That needs a crash inside a millisecond-long
 * critical section and two other processes contending at that moment; every alternative that closes
 * it (rename-verify-restore chains) opens a wider one between three processes. The lost update it
 * could cause is the one this lock otherwise prevents — not a torn file, which
 * {@link writeJsonFileAtomic} rules out independently of any lock.
 *
 * @complexity O(1); one read, one stat, one signal.
 */
function isAbandonedLock(lockPath: string): boolean {
  let holder: string;
  let ageMs: number;
  try {
    holder = fs.readFileSync(lockPath, "utf8");
    ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
  } catch {
    return false; // Released while being examined; the next attempt simply takes it.
  }
  return isDeadPid(Number.parseInt(holder, 10)) || ageMs > LOCK_STALE_MS;
}

/**
 * Whether `pid` is PROVABLY gone. Signal `0` sends nothing; it only asks the kernel whether the pid
 * exists. `EPERM` (someone else's process) counts as alive — the fail-safe direction here, where
 * "dead" is what authorizes breaking another process's lock.
 * @complexity O(1).
 */
function isDeadPid(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

/**
 * Release the lock, but only while it is still the one this process took: if it was broken as
 * abandoned and retaken meanwhile, deleting it would evict its new owner.
 * @complexity O(1).
 */
function releaseLock(lockPath: string, token: string): void {
  try {
    if (fs.readFileSync(lockPath, "utf8") !== token) return;
    fs.rmSync(lockPath, { force: true });
  } catch {
    // Already gone, or a directory this process can no longer write. Either way there is nothing
    // useful to do in a `finally`, and throwing here would mask whatever the critical section threw.
  }
}

/**
 * Park this thread for `ms` without returning to the event loop — the stores' writers are synchronous
 * functions called from synchronous IPC handlers, so waiting for the lock cannot be `await`ed without
 * making every caller async.
 * @complexity O(1).
 */
function sleepSync(ms: number): void {
  Atomics.wait(SLEEP_CELL, 0, 0, ms);
}

/** One place a damaged JSON text could be cut, and what would close the brackets still open there. */
interface PrefixCut {
  end: number;
  closers: string;
}

/**
 * The longest prefix of damaged JSON text that parses once its still-open brackets are closed — what
 * a torn write, or a hand edit broken partway down, leaves recoverable. Every element that ENDED
 * before the damage survives; nothing after it does.
 *
 * The caller validates the result exactly as it validates any other parsed file, so a half-recovered
 * element (an object cut off after its first field) simply fails that validation rather than needing
 * a rule of its own here.
 *
 * @returns the recovered value, or `undefined` when no prefix parses at all.
 * @complexity O(n) to scan, plus up to {@link MAX_SALVAGE_ATTEMPTS} parses of O(n).
 */
function salvageJsonPrefix(text: string): unknown {
  const cuts = elementEnds(text);
  const floor = Math.max(0, cuts.length - MAX_SALVAGE_ATTEMPTS);
  for (let index = cuts.length - 1; index >= floor; index -= 1) {
    const cut = cuts[index]!;
    try {
      return JSON.parse(text.slice(0, cut.end) + cut.closers) as unknown;
    } catch {
      // Cut somewhere this prefix cannot close validly — after an object key, say. Try an earlier one.
    }
  }
  return undefined;
}

/**
 * Every offset just past a complete string, object or array, paired with the closers that would
 * finish the brackets still open at that point (innermost first).
 *
 * Strings, objects and arrays are the only cut points, which is enough for the string-valued files
 * that salvage today (`desktop-projects.json`); a file cut in the middle of a bare number or `true`
 * falls back to the previous cut instead, losing that one element.
 *
 * @complexity O(n) in text length.
 */
function elementEnds(text: string): PrefixCut[] {
  const open: string[] = [];
  const cuts: PrefixCut[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === '"') index = endOfString(text, index);
    else if (char === "{" || char === "[") {
      open.push(char === "{" ? "}" : "]");
      continue;
    } else if (char === "}" || char === "]") open.pop();
    else continue;
    cuts.push({ end: index + 1, closers: [...open].reverse().join("") });
  }
  return cuts;
}

/**
 * The offset of the quote closing the string opening at `start`, or the text's end when the damage
 * falls inside that string (whose cut then fails to parse, as it should).
 * @complexity O(n) in the string's length.
 */
function endOfString(text: string, start: number): number {
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === '"') return index;
  }
  return text.length;
}

export { readJsonFile, tempPathFor, writeJsonFileAtomic, quarantineUnreadableFile, withFileLock, salvageJsonPrefix };
export type { JsonFileRead, QuarantineNotice, FileLockOptions };
