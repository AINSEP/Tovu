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

test("a copy that does not match the original is discarded and the original kept", async (t) => {
  const d = dirs(t);
  await seedLegacy(d);
  const exdev = () => { throw Object.assign(new Error("cross-device link not permitted"), { code: "EXDEV" }); };
  const damagingCopy = (_from: string, to: string) => fs.writeFileSync(to, "truncated");
  assert.throws(() => resolveProjectFiles({ home: d.home, sitesHome: d.sitesHome, projectId: d.projectId }, { link: exdev, copyFile: damagingCopy }),
    /did not match/);
  assert.equal(fs.existsSync(d.next.dbPath), false);
  assert.deepEqual(fs.readdirSync(path.dirname(d.next.dbPath)), ["project-key.hex"], "the temp copy is removed");
  // The original is whole: the next start moves it and reads the saved settings.
  const store = await openProjectStore({ sitesHome: d.sitesHome, home: d.home });
  t.after(() => store.close({}));
  assert.equal(store.dbPath, d.next.dbPath);
  assert.deepEqual(await store.config.read({ pluginId: PLUGIN }), CONFIG);
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
