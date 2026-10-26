import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { atomicCreateSiteKeyFile } from "#src/features/webhooks/site-key-ensure";
import { acquireLock, type LockSeams } from "./project-store-lock.js";

/**
 * @file Moves a `project.db` left at its first home (`<sites root>/project.db`, sealed with the single
 * `~/.tovu/project-key.hex`) to its own folder under `~/.tovu/projects/<projectId>/` (owner
 * 2026-10-25, 8:05 PM): the sites root is often `~/Documents/Tovu`, which iCloud syncs, and a live
 * SQLite file with its -wal must not sync. The user never moves anything by hand: the next start
 * moves it, with no step of theirs.
 *
 * Order matters. The database is first folded into one file (`journal_mode = DELETE` checkpoints the
 * -wal and removes the -wal/-shm; SQLite refuses the switch with SQLITE_BUSY while any other process
 * still holds the file open, which is the "only when not open" check, and it also recovers rows an
 * unclean shutdown left only in the -wal). Then a copy of the old key is published beside the new
 * path, BEFORE the database moves, so the moved rows always have the key that sealed them. The old key
 * stays: another sites root's old `project.db` may still need it. Last, the file moves: a hard link
 * then unlink (atomic, never overwrites) on one volume; across volumes a copy that is fsynced and
 * hash-verified (and its folder fsynced) before the original is removed.
 *
 * A move that fails never throws while the old file is intact (a copy that does not verify, a key
 * that can't be written, a file iCloud evicted): this run uses the old file in place and a later start
 * tries again, so a save never falls through to the site vault. An old name that can't be removed
 * after the move (EPERM/EBUSY: OneDrive, antivirus) is removed by a later start, and only when it is
 * provably the moved file: the same inode, or (across volumes) still the exact bytes that were copied.
 *
 * Two starts at once (web + desktop launched together) take a lock first (`project-store-lock.ts`):
 * only the holder folds, copies the key and moves. The other waits, then finds the file already moved.
 * If its wait runs out it moves nothing and opens the old file only if it still exists (never creating
 * a fresh empty one in the synced sites root), and drops it for the new one if a move landed meanwhile.
 */

export interface ProjectFiles {
  readonly dbPath: string;
  readonly keyFile: string;
}

export interface RelocateOptions {
  /** How long to wait for another process's brief lock before treating the old file as in use. */
  busyTimeoutMs?: number;
  /** `fs.linkSync`; a test seam for a cross-volume (EXDEV) move. */
  link?: (from: string, to: string) => void;
  /** `fs.copyFileSync`; a test seam for a copy that comes out damaged. */
  copyFile?: (from: string, to: string) => void;
  /** `fs.rmSync`; a test seam for an old file Windows/OneDrive/antivirus won't let go of (EPERM/EBUSY). */
  rm?: (file: string) => void;
  /** fsyncs a folder (its new entry); a test seam to see it happen before the original is removed. */
  fsyncDir?: (dir: string) => void;
  /** Seams for the cross-process relocation lock. */
  lock?: LockSeams;
}

/** How the caller opens a database file; `mustExist` for the old place (never create one there). */
export interface ProjectDbOpener<T> {
  open(required: { files: ProjectFiles; mustExist: boolean }): T;
  close(handle: T): void;
}

const errorCode = (error: unknown): unknown => (error as NodeJS.ErrnoException | undefined)?.code;

/**
 * Folds the database into its main file. False when another process still holds it open (or it was
 * moved away meanwhile by a concurrent start); any other failure (a damaged file) is thrown.
 */
function foldIntoOneFile(dbPath: string, busyTimeoutMs: number): boolean {
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { fileMustExist: true, timeout: busyTimeoutMs });
    // Busy normally throws; SQLite may instead return the unchanged mode, which means the same.
    return db.pragma("journal_mode = DELETE", { simple: true }) === "delete";
  } catch (error) {
    if (errorCode(error) === "SQLITE_BUSY" || !fs.existsSync(dbPath)) return false;
    throw error;
  } finally {
    db?.close();
  }
}

/**
 * Publishes a copy of the old key at the new path. Runs only while no database is there (under the
 * lock), so a key already there (a stray: an earlier move that stopped part-way, a store opened then
 * removed) seals nothing yet and is replaced: keeping it would leave the moved rows unopenable.
 */
function carryKey(from: string, to: string): void {
  if (!fs.lstatSync(from, { throwIfNoEntry: false })?.isFile()) return;
  const hex = fs.readFileSync(from, "utf8").trim();
  if (!fs.existsSync(to)) {
    atomicCreateSiteKeyFile(to, hex);
    return;
  }
  if (fs.readFileSync(to, "utf8").trim() === hex) return;
  const tmp = `${to}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    atomicCreateSiteKeyFile(tmp, hex);
    fs.renameSync(tmp, to);
  } finally {
    tryRemove(tmp, (file) => fs.rmSync(file, { force: true }));
  }
}

const sha256Of = (file: string): string => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const MOVED_FROM_FILENAME = "moved-from.json";
const movedFromMarker = (to: string): string => path.join(path.dirname(to), MOVED_FROM_FILENAME);

/** Makes a folder's new entry durable before the original elsewhere is removed. Windows can't open a
 *  folder for fsync (EISDIR/EPERM); NTFS journals the entry itself, so that is skipped. */
function fsyncDirectory(dir: string): void {
  let fd: number | undefined;
  try {
    fd = fs.openSync(dir, "r");
    fs.fsyncSync(fd);
  } catch (error) {
    if (process.platform !== "win32") throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Best-effort removal: a temp or old file that won't go now is left for a later start. */
function tryRemove(file: string, rm: (file: string) => void): boolean {
  try {
    rm(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cross-volume move: copy to a private temp file beside the target, fsync it, verify it, link it into
 * place, fsync the folder.
 * @returns The verified content hash, or undefined when the copy did not match (nothing is placed).
 */
function copyVerified(from: string, to: string, optional: RelocateOptions): string | undefined {
  const tmp = path.join(path.dirname(to), `.${path.basename(to)}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`);
  try {
    (optional.copyFile ?? fs.copyFileSync)(from, tmp);
    const fd = fs.openSync(tmp, "r+");
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    const sha = sha256Of(tmp);
    if (sha !== sha256Of(from)) {
      console.warn(`[project-store] the copy of ${from} did not match the original; it stays where it is for now`);
      return undefined;
    }
    fs.linkSync(tmp, to);
    (optional.fsyncDir ?? fsyncDirectory)(path.dirname(to));
    return sha;
  } finally {
    tryRemove(tmp, (file) => fs.rmSync(file, { force: true }));
  }
}

/**
 * Removes the old name after a move. If it won't go and the move was a copy, records what was copied
 * (`moved-from.json`) so a later start can tell the stale original from a file an old build wrote to.
 */
function removeOriginal(required: { from: string; to: string; copiedSha?: string }, optional: RelocateOptions): void {
  const { from, to, copiedSha } = required;
  if (tryRemove(from, optional.rm ?? ((file) => fs.rmSync(file, { force: true }))) || !copiedSha) return;
  tryRemove(movedFromMarker(to), (file) => fs.writeFileSync(file, JSON.stringify({ path: from, sha256: copiedSha }), { mode: 0o600 }));
}

/**
 * Moves one file without ever overwriting the target; a concurrent start that got there first wins.
 * @returns False when a cross-volume copy did not verify (the original is untouched).
 */
function moveFile(from: string, to: string, optional: RelocateOptions): boolean {
  try {
    (optional.link ?? fs.linkSync)(from, to);
  } catch (error) {
    if (errorCode(error) === "EEXIST" || errorCode(error) === "ENOENT") return true;
    const copiedSha = copyVerified(from, to, optional);
    if (!copiedSha) return false;
    removeOriginal({ from, to, copiedSha }, optional);
    return true;
  }
  removeOriginal({ from, to }, optional);
  return true;
}

/**
 * Folds, publishes the key and moves, under the lock. Re-checks first: another start may have moved
 * it. Any failure while the old file is intact (nothing placed at the new path) keeps the old file.
 */
function moveUnderLock(from: ProjectFiles, to: ProjectFiles, optional: RelocateOptions): ProjectFiles {
  if (fs.existsSync(to.dbPath) || !fs.existsSync(from.dbPath)) return to;
  try {
    if (!foldIntoOneFile(from.dbPath, optional.busyTimeoutMs ?? 1000)) return fs.existsSync(from.dbPath) ? from : to;
    carryKey(from.keyFile, to.keyFile);
    return moveFile(from.dbPath, to.dbPath, optional) ? to : from;
  } catch (error) {
    // A file at the new path is always whole (it is only ever linked into place), so it wins.
    if (fs.existsSync(to.dbPath) || !fs.existsSync(from.dbPath)) return to;
    console.warn(`[project-store] could not move ${from.dbPath} to ${to.dbPath}; using it in place this run: ${error instanceof Error ? error.message : String(error)}`);
    return from;
  }
}

const sameFile = (a: fs.BigIntStats, b: fs.BigIntStats): boolean => a.dev === b.dev && a.ino === b.ino;

/** True when the old file is still exactly what an earlier cross-volume move copied. */
function isCopiedOriginal(from: string, to: string): boolean {
  try {
    const marker = JSON.parse(fs.readFileSync(movedFromMarker(to), "utf8")) as { path?: unknown; sha256?: unknown };
    return marker.path === from && marker.sha256 === sha256Of(from);
  } catch {
    return false;
  }
}

/**
 * After the move: removes an old name an earlier move could not, only when it is provably the moved
 * file (the same inode, or the unchanged bytes that were copied). Never throws.
 * @complexity O(1) stats; O(file size) once, when a copy left its original behind.
 */
function removeLeftOriginal(from: string, to: string, optional: RelocateOptions): void {
  try {
    const old = fs.statSync(from, { bigint: true, throwIfNoEntry: false });
    if (old && (sameFile(old, fs.statSync(to, { bigint: true })) || isCopiedOriginal(from, to))) {
      tryRemove(from, optional.rm ?? ((file) => fs.rmSync(file, { force: true })));
    } else if (old) {
      warnBothOnce(from, to);
    }
    if (!fs.existsSync(from)) tryRemove(movedFromMarker(to), (file) => fs.rmSync(file, { force: true }));
  } catch { /* a later start tries again */ }
}

const warnedPairs = new Set<string>();

/** Two different project.db files (an old build wrote a new one at the old place): said once per process. */
function warnBothOnce(from: string, to: string): void {
  if (warnedPairs.has(`${from}\0${to}`)) return;
  warnedPairs.add(`${from}\0${to}`);
  console.warn(`[project-store] two project.db files: using ${to}; ${from} was not moved there and is left as it is`);
}

/** True when there is an old file to move and nothing at the new place yet. */
const needsMove = (from: ProjectFiles, to: ProjectFiles): boolean => !fs.existsSync(to.dbPath) && fs.existsSync(from.dbPath);

/**
 * Runs `work` on the files to use: with the relocation lock held, the result of the move; once the
 * wait for another start's lock runs out, whatever is there now (nothing is moved without the lock).
 */
function withRelocationLock<T>(required: { from: ProjectFiles; to: ProjectFiles; work: (files: ProjectFiles) => T }, optional: RelocateOptions): T {
  const { from, to } = required;
  fs.mkdirSync(path.dirname(to.dbPath), { recursive: true, mode: 0o700 });
  const release = acquireLock({ file: path.join(path.dirname(to.dbPath), "relocate.lock") }, optional.lock);
  try {
    return required.work(release ? moveUnderLock(from, to, optional) : fs.existsSync(to.dbPath) ? to : from);
  } finally {
    release?.();
  }
}

/**
 * Which `project.db` + key this start uses, moving an old one into place first.
 * @param required.from The old pair (`<sites root>/project.db`, `~/.tovu/project-key.hex`).
 * @param required.to The new pair (`~/.tovu/projects/<projectId>/`).
 * @returns `to`, or `from` for this run when the old file could not be moved (another process still
 *   holds it open, or the move failed part-way: it is kept as it was and a later start tries again).
 *   Never throws while the old file is intact.
 * @complexity O(file size) for the fold and, across volumes, the copy + two hashes.
 */
export function relocateProjectDb(required: { from: ProjectFiles; to: ProjectFiles }, optional: RelocateOptions = {}): ProjectFiles {
  const { from, to } = required;
  if (!needsMove(from, to)) {
    removeLeftOriginal(from.dbPath, to.dbPath, optional);
    return to;
  }
  return withRelocationLock({ from, to, work: (files) => files }, optional);
}

function openNew<T>(to: ProjectFiles, opener: ProjectDbOpener<T>): { files: ProjectFiles; db: T } {
  fs.mkdirSync(path.dirname(to.dbPath), { recursive: true, mode: 0o700 });
  return { files: to, db: opener.open({ files: to, mustExist: false }) };
}

/**
 * Opens the chosen file. The OLD one only if it still exists (`mustExist`), and re-checked after
 * opening: a move that landed meanwhile means the old name now points at a file another start uses
 * under the new name (two names, two -wal files), so it is closed and the new one opened.
 */
function openChecked<T>(required: { files: ProjectFiles; to: ProjectFiles; opener: ProjectDbOpener<T> }): { files: ProjectFiles; db: T } {
  const { files, to, opener } = required;
  if (files === to) return openNew(to, opener);
  let db: T;
  try {
    db = opener.open({ files, mustExist: true });
  } catch (error) {
    if (fs.existsSync(files.dbPath)) throw error;
    return openNew(to, opener);
  }
  if (!fs.existsSync(to.dbPath)) return { files, db };
  opener.close(db);
  return openNew(to, opener);
}

/**
 * {@link relocateProjectDb}, then opens the file it chose; the open of an old file happens under the
 * same lock as the move, so no other start can move it away between the choice and the open.
 * @returns The files used and the opened handle.
 * @throws What `opener.open` throws for a file that exists (damaged, unreadable); see relocateProjectDb.
 * @complexity As relocateProjectDb, plus one or two opens.
 */
export function openProjectDb<T>(required: { from: ProjectFiles; to: ProjectFiles; opener: ProjectDbOpener<T> }, optional: RelocateOptions = {}): { files: ProjectFiles; db: T } {
  const { from, to, opener } = required;
  if (!needsMove(from, to)) {
    removeLeftOriginal(from.dbPath, to.dbPath, optional);
    return openNew(to, opener);
  }
  return withRelocationLock({ from, to, work: (files) => openChecked({ files, to, opener }) }, optional);
}
