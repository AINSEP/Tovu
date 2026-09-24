/**
 * @file Which instances of this app are running right now, recorded as one small JSON file per
 * instance in `<userData>/instances/<pid>.json`.
 *
 * The app has no single-instance lock on purpose (the owner runs several at once), so nothing else
 * knows about siblings. The auto-updater needs to: only one instance may download (see
 * `update-policy.ts`'s `electUpdaterOwner`), and an update may only be installed by the last one to
 * quit (`decideFinalQuit`).
 *
 * Liveness is the pid, checked with signal 0, and a record whose pid is gone is deleted on read, so
 * a crashed instance does not linger. A reused pid can make a dead instance look alive; that errs
 * toward NOT installing, which is the safe side. Owner election additionally ignores stale
 * heartbeats, so such a record cannot stop every instance from checking.
 *
 * No `electron` import, so it runs under plain `node --test`.
 */
import fs from "node:fs";
import path from "node:path";

import type { InstanceRecord } from "./update-policy.ts";

/** `<userData>/instances`. @complexity O(1). */
function presenceDirPath(userDataDir: string): string {
  return path.join(userDataDir, "instances");
}

/**
 * @returns whether a process with this pid exists. `EPERM` means it exists but belongs to someone
 *   else, which still counts.
 * @complexity O(1).
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Writes (or refreshes) this instance's record. Written to a temp file and renamed, so a sibling
 * reading the directory never sees half a record.
 * @complexity O(1).
 */
function writeInstanceRecord(dir: string, record: InstanceRecord): void {
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${record.pid}.json`);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(record));
  fs.renameSync(temp, target);
}

/** Deletes this instance's record. Never throws: it runs on the way out. @complexity O(1). */
function removeInstanceRecord(dir: string, pid: number): void {
  try {
    fs.unlinkSync(path.join(dir, `${pid}.json`));
  } catch {
    // Already gone, or the directory was removed: nothing left to clean up.
  }
}

/** @returns the record in `text`, or `null` if it is not one. @complexity O(1). */
function parseRecord(text: string): InstanceRecord | null {
  try {
    const value = JSON.parse(text) as Partial<InstanceRecord>;
    const fields = [value.pid, value.startedAt, value.heartbeatAt];
    return fields.every((field) => typeof field === "number" && Number.isFinite(field)) ? (value as InstanceRecord) : null;
  } catch {
    return null;
  }
}

/**
 * Every live instance's record. A record whose pid is dead is deleted as it is read; an unreadable
 * or malformed file is skipped and left alone (it may be mid-write by a sibling on a filesystem
 * without atomic rename).
 *
 * @param dir the presence directory.
 * @param isAlive the liveness check, {@link isPidAlive} by default.
 * @complexity O(n) in files in `dir`.
 */
function readLiveInstances(dir: string, isAlive: (pid: number) => boolean = isPidAlive): InstanceRecord[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((name) => /^\d+\.json$/.test(name));
  } catch {
    return [];
  }
  const live: InstanceRecord[] = [];
  for (const name of names) {
    const record = readRecordFile(path.join(dir, name));
    if (record === null) continue;
    if (isAlive(record.pid)) live.push(record);
    else removeInstanceRecord(dir, record.pid);
  }
  return live;
}

/** @returns the record in `file`, or `null` if it cannot be read or parsed. @complexity O(1). */
function readRecordFile(file: string): InstanceRecord | null {
  try {
    return parseRecord(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export { isPidAlive, presenceDirPath, readLiveInstances, removeInstanceRecord, writeInstanceRecord };
