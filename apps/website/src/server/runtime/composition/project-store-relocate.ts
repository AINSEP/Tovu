import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { atomicCreateSiteKeyFile } from "#src/features/webhooks/site-key-ensure";

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
  if (fs.existsSync(to.dbPath) || !fs.existsSync(from.dbPath)) return to;
  if (!foldIntoOneFile(from.dbPath, optional.busyTimeoutMs ?? 1000)) return fs.existsSync(from.dbPath) ? from : to;
  fs.mkdirSync(path.dirname(to.dbPath), { recursive: true, mode: 0o700 });
  carryKey(from.keyFile, to.keyFile);
  moveFile(from.dbPath, to.dbPath, optional);
  return to;
}
