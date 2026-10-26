import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";

import { legacyProjectFiles, openProjectStore, projectDbPath, projectIdFor, projectKeyFilePath, resolveProjectFiles } from "../project-store.js";
import { openProjectDb } from "../project-store-relocate.js";

/**
 * @file Moving a `project.db` left at the old place (`<sites root>/project.db`, sealed with the single
 * `~/.tovu/project-key.hex`) to `~/.tovu/projects/<projectId>/` on the next start, with no user step:
 * its uncheckpointed WAL rows come along, a copy of the old key comes with it, a file another process
 * still holds open is used in place for that run, and a cross-volume move is copied and verified.
 */

const PLUGIN = "analytics-posthog";
const CONFIG = { settings: { host: "https://ph.example.test" }, secrets: { apiKey: ["phc", "legacy"].join("_") } };

function dirs(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-project-relocate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, "home");
  const sitesHome = path.join(home, "Documents", "Tovu");
  const projectId = projectIdFor({ sitesHome });
  return { root, home, sitesHome, projectId, legacy: legacyProjectFiles({ home, sitesHome }),
    next: { dbPath: projectDbPath({ home, projectId }), keyFile: projectKeyFilePath({ home, projectId }) } };
}

/** Lays down the OLD layout: a saved config in `<sites root>/project.db` sealed with `~/.tovu/project-key.hex`. */
async function seedLegacy({ root, home, sitesHome }: { root: string; home: string; sitesHome: string }): Promise<void> {
  const scratchHome = path.join(root, "scratch-home");
  const scratch = await openProjectStore({ sitesHome, home: scratchHome });
  await scratch.config.write({ pluginId: PLUGIN, config: CONFIG });
  scratch.close({});
  fs.mkdirSync(sitesHome, { recursive: true });
  fs.mkdirSync(path.join(home, ".tovu"), { recursive: true });
  fs.copyFileSync(scratch.dbPath, path.join(sitesHome, "project.db"));
  fs.copyFileSync(projectKeyFilePath({ home: scratchHome, projectId: scratch.projectId }), path.join(home, ".tovu", "project-key.hex"));
  fs.rmSync(scratchHome, { recursive: true, force: true });
}

test("an old <sites root>/project.db is moved beside a copy of its key; the old shared key stays for other projects", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  const legacyKey = fs.readFileSync(d.legacy.keyFile, "utf8");
  const store = await openProjectStore({ sitesHome: d.sitesHome, home: d.home });
  t.after(() => store.close({}));
  assert.equal(store.dbPath, d.next.dbPath);
  assert.deepEqual(await store.config.read({ pluginId: PLUGIN }), CONFIG);
  assert.equal(fs.existsSync(d.legacy.dbPath), false, "the old file is gone from the (often synced) sites root");
  assert.deepEqual(fs.readdirSync(d.sitesHome).filter((name) => name.startsWith("project.db")), []);
  assert.equal(fs.readFileSync(d.next.keyFile, "utf8").trim(), legacyKey.trim());
  assert.equal(fs.statSync(d.next.keyFile).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(d.legacy.keyFile, "utf8"), legacyKey, "another project's old file may still need it");
});

test("rows still only in the old file's -wal (an unclean shutdown) move too, and no -wal/-shm is left behind", (t) => {
  const d = dirs(t);
  fs.mkdirSync(d.sitesHome, { recursive: true });
  // A child writes in WAL mode with checkpoints off and is killed before closing: the row lives only in -wal.
  const script = `const D=require(${JSON.stringify(createRequire(import.meta.url).resolve("better-sqlite3"))});const db=new D(process.argv[1]);`
    + `db.pragma("journal_mode = WAL");db.pragma("wal_autocheckpoint = 0");db.exec("create table probe(x text)");`
    + `db.prepare("insert into probe values ('kept')").run();process.kill(process.pid,"SIGKILL");`;
  spawnSync(process.execPath, ["-e", script, d.legacy.dbPath]);
  assert.ok(fs.existsSync(`${d.legacy.dbPath}-wal`), "fixture: the row is in the -wal");
  assert.deepEqual(resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId }), d.next);
  assert.deepEqual(fs.readdirSync(d.sitesHome), []);
  const moved = new Database(d.next.dbPath, { readonly: true });
  t.after(() => moved.close());
  assert.deepEqual(moved.prepare("select x from probe").all(), [{ x: "kept" }]);
});

test("an old file another process still holds open is used in place this run, then moved on a later start", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  // An older app build (web or desktop) still has it open in WAL mode.
  const holder = new Database(d.legacy.dbPath);
  holder.pragma("journal_mode = WAL");
  holder.prepare("select count(*) from sqlite_master").get();
  const inPlace = await openProjectStore({ sitesHome: d.sitesHome, home: d.home }, { relocate: { busyTimeoutMs: 0 } });
  assert.equal(inPlace.dbPath, d.legacy.dbPath);
  assert.deepEqual(await inPlace.config.read({ pluginId: PLUGIN }), CONFIG, "read with the old key");
  assert.equal(fs.existsSync(d.next.dbPath), false);
  inPlace.close({});
  holder.close();
  const moved = await openProjectStore({ sitesHome: d.sitesHome, home: d.home });
  t.after(() => moved.close({}));
  assert.equal(moved.dbPath, d.next.dbPath);
  assert.deepEqual(await moved.config.read({ pluginId: PLUGIN }), CONFIG);
  assert.equal(fs.existsSync(d.legacy.dbPath), false);
});

test("across volumes (no hard link) the file is copied, verified, and only then removed from the old place", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  const exdev = () => { throw Object.assign(new Error("cross-device link not permitted"), { code: "EXDEV" }); };
  assert.deepEqual(resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId }, { link: exdev }), d.next);
  assert.equal(fs.existsSync(d.legacy.dbPath), false);
  assert.deepEqual(fs.readdirSync(path.dirname(d.next.dbPath)).sort(), ["project-key.hex", "project.db"], "no temp copy left");
  const store = await openProjectStore({ sitesHome: d.sitesHome, home: d.home });
  t.after(() => store.close({}));
  assert.deepEqual(await store.config.read({ pluginId: PLUGIN }), CONFIG);
});

test("a copy that does not match the original is discarded and the original kept and used this run (no throw)", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  const exdev = () => { throw Object.assign(new Error("cross-device link not permitted"), { code: "EXDEV" }); };
  const damagingCopy = (_from: string, to: string) => fs.writeFileSync(to, "truncated");
  assert.deepEqual(resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId }, { link: exdev, copyFile: damagingCopy }), d.legacy);
  assert.equal(fs.existsSync(d.next.dbPath), false);
  assert.deepEqual(fs.readdirSync(path.dirname(d.next.dbPath)), ["project-key.hex"], "the temp copy is removed");
  const inPlace = await openProjectStore({ sitesHome: d.sitesHome, home: d.home }, { relocate: { link: exdev, copyFile: damagingCopy } });
  assert.equal(inPlace.dbPath, d.legacy.dbPath, "the store opens on the old file, never throws into the site vault");
  assert.deepEqual(await inPlace.config.read({ pluginId: PLUGIN }), CONFIG);
  inPlace.close({});
  // The original is whole: the next start moves it and reads the saved settings.
  const store = await openProjectStore({ sitesHome: d.sitesHome, home: d.home });
  t.after(() => store.close({}));
  assert.equal(store.dbPath, d.next.dbPath);
  assert.deepEqual(await store.config.read({ pluginId: PLUGIN }), CONFIG);
});

test("a move that fails part-way (key copy refused, iCloud-evicted or damaged file) keeps the old file in use, never throws", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  const ioerr = () => { throw Object.assign(new Error("disk I/O error"), { code: "SQLITE_IOERR" }); };
  assert.deepEqual(resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId }, { link: ioerr, copyFile: ioerr }), d.legacy);
  assert.ok(fs.existsSync(d.legacy.dbPath));
  assert.equal(fs.existsSync(d.next.dbPath), false);
  fs.writeFileSync(d.legacy.dbPath, "not a database");
  assert.deepEqual(resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId }), d.legacy);
  assert.equal(fs.readFileSync(d.legacy.dbPath, "utf8"), "not a database", "kept exactly as it was");
});

test("a linked move whose old name can't be removed (EPERM/EBUSY: OneDrive, antivirus) still uses the new file; a later start removes the old name", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  const busy = () => { throw Object.assign(new Error("resource busy or locked"), { code: "EBUSY" }); };
  assert.deepEqual(resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId }, { rm: busy }), d.next);
  assert.ok(fs.existsSync(d.legacy.dbPath), "fixture: the old name is still there");
  const store = await openProjectStore({ sitesHome: d.sitesHome, home: d.home });
  t.after(() => store.close({}));
  assert.equal(store.dbPath, d.next.dbPath);
  assert.equal(fs.existsSync(d.legacy.dbPath), false, "same file (same inode): the old name is removed");
  assert.deepEqual(await store.config.read({ pluginId: PLUGIN }), CONFIG);
});

test("a cross-volume copy whose original can't be removed: a later start removes the original only while it is unchanged", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  const exdev = () => { throw Object.assign(new Error("cross-device link not permitted"), { code: "EXDEV" }); };
  const eperm = () => { throw Object.assign(new Error("operation not permitted"), { code: "EPERM" }); };
  const syncedDirs: Array<{ dir: string; originalPresent: boolean }> = [];
  const fsyncDir = (dir: string) => { syncedDirs.push({ dir, originalPresent: fs.existsSync(d.legacy.dbPath) }); };
  assert.deepEqual(resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId }, { link: exdev, rm: eperm, fsyncDir }), d.next);
  assert.deepEqual(syncedDirs, [{ dir: path.dirname(d.next.dbPath), originalPresent: true }], "the target folder is fsynced before the original goes");
  // Unchanged original: removed on the next start, even though the moved copy has since been written to.
  const store = await openProjectStore({ sitesHome: d.sitesHome, home: d.home });
  store.close({});
  assert.equal(fs.existsSync(d.legacy.dbPath), false);
  assert.deepEqual(fs.readdirSync(path.dirname(d.next.dbPath)).filter((name) => !name.startsWith("project.db") && name !== "project-key.hex"), [], "no marker left");
  // A changed original (an old build wrote to it) is never removed.
  await seedLegacy(d);
  fs.rmSync(d.next.dbPath);
  assert.deepEqual(resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId }, { link: exdev, rm: eperm }), d.next);
  fs.appendFileSync(d.legacy.dbPath, "changed");
  assert.deepEqual(resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId }), d.next);
  assert.ok(fs.existsSync(d.legacy.dbPath), "a changed original is kept");
});

test("when both places hold a project.db the new one wins and the old one is left untouched", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  fs.mkdirSync(path.dirname(d.next.dbPath), { recursive: true });
  fs.writeFileSync(d.next.dbPath, "");
  assert.deepEqual(resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId }), d.next);
  assert.ok(fs.existsSync(d.legacy.dbPath));
  assert.equal(fs.existsSync(d.next.keyFile), false, "no old key is copied for a database it did not seal");
});

test("a fresh install (nothing at the old place) touches nothing there and copies no old key", (t) => {
  const d = dirs(t);
  fs.mkdirSync(path.dirname(d.legacy.keyFile), { recursive: true });
  fs.writeFileSync(d.legacy.keyFile, "ab".repeat(32), { mode: 0o600 });
  assert.deepEqual(resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId }), d.next);
  assert.equal(fs.existsSync(d.next.keyFile), false);
  assert.equal(fs.existsSync(d.sitesHome), false);
});

// --- Two starts at once (web + desktop): the relocation lock and the old-path open --------------

interface FakeHandle { readonly dbPath: string }

/** A db opener that records every open/close and behaves like SQLite's `fileMustExist` on a missing file. */
function recordingOpener(hooks: { beforeOpen?: (dbPath: string) => void } = {}) {
  const opens: Array<{ dbPath: string; mustExist: boolean }> = [];
  const closes: string[] = [];
  return {
    opens, closes,
    open({ files, mustExist }: { files: { dbPath: string }; mustExist: boolean }): FakeHandle {
      hooks.beforeOpen?.(files.dbPath);
      if (mustExist && !fs.existsSync(files.dbPath)) throw Object.assign(new Error("unable to open database file"), { code: "SQLITE_CANTOPEN" });
      opens.push({ dbPath: files.dbPath, mustExist });
      return { dbPath: files.dbPath };
    },
    close(handle: FakeHandle) { closes.push(handle.dbPath); },
  };
}

/** What the OTHER start does once it holds the lock: link + unlink the old file and publish the key. */
function otherStartMoves(d: ReturnType<typeof dirs>): void {
  fs.mkdirSync(path.dirname(d.next.dbPath), { recursive: true });
  if (!fs.existsSync(d.next.keyFile)) fs.copyFileSync(d.legacy.keyFile, d.next.keyFile);
  fs.linkSync(d.legacy.dbPath, d.next.dbPath);
  fs.rmSync(d.legacy.dbPath);
}

const lockFileOf = (d: ReturnType<typeof dirs>) => path.join(path.dirname(d.next.dbPath), "relocate.lock");

function holdLock(d: ReturnType<typeof dirs>, holder: { pid: number; atMs: number }): void {
  fs.mkdirSync(path.dirname(d.next.dbPath), { recursive: true });
  fs.writeFileSync(lockFileOf(d), JSON.stringify(holder));
}

test("a second start waits on the first start's move, then opens the moved file: never a fresh one in the sites root", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  holdLock(d, { pid: process.pid, atMs: Date.now() });
  const opener = recordingOpener();
  let slept = 0;
  const sleep = () => { if (slept++ === 0) { otherStartMoves(d); fs.rmSync(lockFileOf(d)); } };
  const opened = openProjectDb({ from: d.legacy, to: d.next, opener }, { lock: { sleep } });
  assert.deepEqual(opened.files, d.next);
  assert.deepEqual(opener.opens, [{ dbPath: d.next.dbPath, mustExist: false }]);
  assert.equal(fs.existsSync(d.legacy.dbPath), false, "no empty project.db created in the synced sites root");
  assert.ok(slept >= 1, "it waited for the lock");
});

test("the lock is never held by two starts: this start moves only once it holds it, and lets it go after", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  const opener = recordingOpener({ beforeOpen: () => assert.ok(fs.existsSync(lockFileOf(d)), "the open happens under the lock") });
  const opened = openProjectDb({ from: d.legacy, to: d.next, opener });
  assert.deepEqual(opened.files, d.next);
  assert.equal(fs.existsSync(d.legacy.dbPath), false);
  assert.equal(fs.existsSync(lockFileOf(d)), false, "released");
});

test("a lock left by a start that died (its pid is gone) is taken over, and the move proceeds", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  holdLock(d, { pid: 2_147_000_000, atMs: Date.now() });
  const opener = recordingOpener();
  const opened = openProjectDb({ from: d.legacy, to: d.next, opener }, { lock: { isAlive: () => false, sleep: () => assert.fail("no wait on a dead holder") } });
  assert.deepEqual(opened.files, d.next);
  assert.equal(fs.existsSync(d.legacy.dbPath), false);
  assert.equal(fs.existsSync(lockFileOf(d)), false);
});

test("a lock too old to be live (a reused pid, or a half-written lock file) is taken over", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  holdLock(d, { pid: process.pid, atMs: 0 });
  const opener = recordingOpener();
  assert.deepEqual(openProjectDb({ from: d.legacy, to: d.next, opener }, { lock: { sleep: () => assert.fail("no wait on a stale lock") } }).files, d.next);
  fs.writeFileSync(lockFileOf(d), "");
  const old = new Date(Date.now() - 10 * 60_000);
  fs.utimesSync(lockFileOf(d), old, old);
  fs.rmSync(d.next.dbPath);
  await seedLegacy(d);
  assert.deepEqual(openProjectDb({ from: d.legacy, to: d.next, opener }, { lock: { sleep: () => assert.fail("no wait on a stale lock") } }).files, d.next);
});

test("when the lock wait runs out, the old file is opened only if it still exists (never created) and dropped for the new one if a move landed meanwhile", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  holdLock(d, { pid: process.pid, atMs: Date.now() });
  // The other start finishes its move right after this one opened the old file.
  let moved = false;
  const opener = recordingOpener({ beforeOpen: () => undefined });
  const racing = { ...opener, open(input: { files: { dbPath: string }; mustExist: boolean }) {
    const handle = opener.open(input);
    if (!moved && input.files.dbPath === d.legacy.dbPath) { moved = true; otherStartMoves(d); }
    return handle;
  } };
  const opened = openProjectDb({ from: d.legacy, to: d.next, opener: racing }, { lock: { waitMs: 0 } });
  assert.deepEqual(opened.files, d.next);
  assert.deepEqual(opener.opens, [{ dbPath: d.legacy.dbPath, mustExist: true }, { dbPath: d.next.dbPath, mustExist: false }]);
  assert.deepEqual(opener.closes, [d.legacy.dbPath], "the old-path handle is closed before the new one is used");
});

test("when the lock wait runs out and the old file vanishes before it opens, the moved file is opened instead", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  holdLock(d, { pid: process.pid, atMs: Date.now() });
  const opener = recordingOpener({ beforeOpen: (dbPath) => { if (dbPath === d.legacy.dbPath) otherStartMoves(d); } });
  const opened = openProjectDb({ from: d.legacy, to: d.next, opener }, { lock: { waitMs: 0 } });
  assert.deepEqual(opened.files, d.next);
  assert.deepEqual(opener.opens, [{ dbPath: d.next.dbPath, mustExist: false }]);
  assert.equal(fs.existsSync(d.legacy.dbPath), false, "nothing was created at the old place");
});

test("a stray key at the new place with no database beside it is replaced by the old key (nothing is sealed under it yet)", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  fs.mkdirSync(path.dirname(d.next.keyFile), { recursive: true });
  fs.writeFileSync(d.next.keyFile, "cd".repeat(32), { mode: 0o600 });
  const store = await openProjectStore({ sitesHome: d.sitesHome, home: d.home });
  t.after(() => store.close({}));
  assert.equal(fs.readFileSync(d.next.keyFile, "utf8").trim(), fs.readFileSync(d.legacy.keyFile, "utf8").trim());
  assert.equal(fs.statSync(d.next.keyFile).mode & 0o777, 0o600);
  assert.deepEqual(await store.config.read({ pluginId: PLUGIN }), CONFIG, "the moved rows open with the key that sealed them");
  assert.deepEqual(fs.readdirSync(path.dirname(d.next.dbPath)).filter((name) => name.includes(".tmp")), [], "no temp key left");
});

test("when both places hold a project.db, one warning names both paths", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  fs.mkdirSync(path.dirname(d.next.dbPath), { recursive: true });
  fs.writeFileSync(d.next.dbPath, "");
  const warnings: string[] = [];
  t.mock.method(console, "warn", (message: string) => { warnings.push(message); });
  resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId });
  resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId });
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0]!.includes(d.legacy.dbPath) && warnings[0]!.includes(d.next.dbPath), warnings[0]);
});
