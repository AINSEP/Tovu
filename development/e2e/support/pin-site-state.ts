import assert from "node:assert/strict";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { makeDirectoriesWritable } from "./journey-site-cleanup-reporter.js";

/** SQLite's maintained Online Backup API copies every table (including FTS, sessions and
 * ledgers), not a guessed list of DELETE routes. Restoring THROUGH SQLite updates the existing
 * inode and its change counter, so the warm daemon's connections invalidate their page caches.
 * Never rename a database underneath a live connection, or copy its WAL/SHM sidecars. */
export async function pinSiteState(
  { siteDir, snapshotDir, action }: { siteDir: string; snapshotDir: string; action: "snapshot" | "reset" },
  { pauseDaemon = () => {} }: { pauseDaemon?: () => void } = {},
): Promise<void> {
  const databases = async (dir: string): Promise<string[]> => {
    const found: string[] = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) found.push(...await databases(file));
      else if (entry.isFile() && entry.name.endsWith(".db")) found.push(file);
    }
    return found;
  };
  const backup = async (source: string, destination: string) => {
    await mkdir(path.dirname(destination), { recursive: true });
    const db = new Database(source, { readonly: true, fileMustExist: true });
    const deadline = Date.now() + 10_000;
    try {
      await db.backup(destination, { progress: () => {
        assert.ok(Date.now() < deadline, "A writer held SQLite open during the pin reset");
        return 2_147_483_647; // All pages in one step; a busy destination still calls progress.
      } });
    } finally { db.close(); }
  };
  const isDatabase = (name: string) => /\.db(?:-wal|-shm|-journal)?$/.test(name);
  // Do not suspend the daemon halfway through a write transaction: its held lock would prevent
  // restoration forever. Acquire every writer lock first, suspend it, then release our locks.
  // SQLite reads in WAL mode can survive this and invalidate their snapshot on the next query.
  const locks: Database.Database[] = [];
  try {
    for (const file of await databases(siteDir)) {
      const db = new Database(file, { fileMustExist: true, timeout: 10_000 });
      locks.push(db);
      db.exec("BEGIN IMMEDIATE");
    }
    pauseDaemon();
  } finally {
    for (const db of locks.reverse()) {
      try { if (db.inTransaction) db.exec("ROLLBACK"); } finally { db.close(); }
    }
  }
  if (action === "snapshot") {
    await mkdir(snapshotDir);
    await cp(siteDir, path.join(snapshotDir, "files"), { recursive: true, filter: (source) =>
      !isDatabase(source) && path.relative(siteDir, source).split(path.sep)[0] !== "ops" });
    for (const file of await databases(siteDir)) {
      await backup(file, path.join(snapshotDir, "databases", path.relative(siteDir, file)));
    }
    return;
  }
  const seedDatabases = await databases(path.join(snapshotDir, "databases"));
  const seededPaths = new Set(seedDatabases.map((file) => path.join(siteDir, path.relative(path.join(snapshotDir, "databases"), file))));
  for (const file of await databases(siteDir)) {
    if (!seededPaths.has(file)) {
      for (const suffix of ["", "-wal", "-shm", "-journal"]) await rm(`${file}${suffix}`, { force: true });
    }
  }
  for (const file of seedDatabases) {
    await backup(file, path.join(siteDir, path.relative(path.join(snapshotDir, "databases"), file)));
  }
  // Mutable files matter too: uploads, templates, exports, credentials and activation manifests.
  // ops holds the still-owned daemon registry/log descriptors; its DBs were restored above.
  const clearFiles = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if ((dir === siteDir && entry.name === "ops") || isDatabase(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await makeDirectoriesWritable({ dir: file });
        await clearFiles(file);
        // Preserve directories containing an open nested DB, not just the root-level DBs.
        if ((await readdir(file)).length) continue;
      }
      await rm(file, { recursive: true, force: true });
    }
  };
  await clearFiles(siteDir);
  await cp(path.join(snapshotDir, "files"), siteDir, { recursive: true });
}
