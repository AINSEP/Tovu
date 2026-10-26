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
 * hash-verified before the original is removed.
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

/** Publishes a copy of the old key at the new path, unless a key is already there. */
function carryKey(from: string, to: string): void {
  if (fs.existsSync(to) || !fs.lstatSync(from, { throwIfNoEntry: false })?.isFile()) return;
  atomicCreateSiteKeyFile(to, fs.readFileSync(from, "utf8").trim());
}

const sha256Of = (file: string): string => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/** Cross-volume move: copy to a private temp file beside the target, fsync, verify, link into place. */
function copyVerified(from: string, to: string, copyFile: (from: string, to: string) => void): void {
  const tmp = path.join(path.dirname(to), `.${path.basename(to)}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`);
  try {
    copyFile(from, tmp);
    const fd = fs.openSync(tmp, "r+");
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (sha256Of(tmp) !== sha256Of(from)) throw new Error(`the copy of ${from} did not match the original; it was kept where it is`);
    fs.linkSync(tmp, to);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** Moves one file without ever overwriting the target; a concurrent start that got there first wins. */
function moveFile(from: string, to: string, optional: RelocateOptions): void {
  try {
    (optional.link ?? fs.linkSync)(from, to);
  } catch (error) {
    if (errorCode(error) === "EEXIST" || errorCode(error) === "ENOENT") return;
    copyVerified(from, to, optional.copyFile ?? fs.copyFileSync);
  }
  fs.rmSync(from, { force: true });
}

/** Folds, publishes the key and moves, under the lock. Re-checks first: another start may have moved it. */
function moveUnderLock(from: ProjectFiles, to: ProjectFiles, optional: RelocateOptions): ProjectFiles {
  if (fs.existsSync(to.dbPath) || !fs.existsSync(from.dbPath)) return to;
  if (!foldIntoOneFile(from.dbPath, optional.busyTimeoutMs ?? 1000)) return fs.existsSync(from.dbPath) ? from : to;
  carryKey(from.keyFile, to.keyFile);
  moveFile(from.dbPath, to.dbPath, optional);
  return to;
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
 * @returns `to`, or `from` for this run only when another process still holds the old file open.
 * @throws When the old file is damaged (not a database) or a cross-volume copy does not verify; the
 *   old file is kept as it was.
 * @complexity O(file size) for the fold and, across volumes, the copy + two hashes.
 */
export function relocateProjectDb(required: { from: ProjectFiles; to: ProjectFiles }, optional: RelocateOptions = {}): ProjectFiles {
  const { from, to } = required;
  if (!needsMove(from, to)) return to;
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
  if (!needsMove(from, to)) return openNew(to, opener);
  return withRelocationLock({ from, to, work: (files) => openChecked({ files, to, opener }) }, optional);
}
