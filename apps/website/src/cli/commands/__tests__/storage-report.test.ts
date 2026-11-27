/**
 * @file P11 ST-16 (report half): `tovu storage report <dir> [--json]` measures a website folder
 * without booting it. It opens no database, claims no lease, writes no registry entry and creates no
 * folder — so it is safe beside a running site. Clean and compact are later slices (ST-6/ST-7b).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import { nodeStorageTreeFs, type StorageTreeFs } from "@jini-ai/platform/retention";

import { measureSiteStorage } from "#src/features/storage/measure";
import { resolveSiteStorageLocations, runStorageReportCommand, type StorageReportPaths } from "../storage-report.js";

async function site(t: TestContext): Promise<string> {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "storage-report-")));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const name of ["content.db", "chat.db"]) {
    const db = new Database(path.join(dir, name));
    db.exec("CREATE TABLE t (x TEXT); INSERT INTO t VALUES ('hello');");
    db.close();
  }
  await mkdir(path.join(dir, "uploads"), { recursive: true });
  await writeFile(path.join(dir, "uploads", "photo.jpg"), Buffer.alloc(3000));
  await mkdir(path.join(dir, "ops", "logs"), { recursive: true });
  await writeFile(path.join(dir, "ops", "logs", "server.log"), Buffer.alloc(700));
  await writeFile(path.join(dir, "ops", "pre-migrations-2026-11-01T00-00-00-000Z.db"), Buffer.alloc(400));
  await mkdir(path.join(dir, ".captures", "2026-11-20"), { recursive: true });
  await writeFile(path.join(dir, ".captures", "2026-11-20", "home.png"), Buffer.alloc(900));
  await writeFile(path.join(dir, "notes.txt"), Buffer.alloc(50));
  return dir;
}

const inSite = (dir: string): StorageReportPaths => () => ({ contentDbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db") });
const quiet = { write: () => true };

async function snapshot(dir: string): Promise<string> {
  const lines: string[] = [];
  async function walk(at: string): Promise<void> {
    for (const entry of (await readdir(at, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) { lines.push(`d ${path.relative(dir, full)}`); await walk(full); continue; }
      const info = await stat(full);
      lines.push(`f ${path.relative(dir, full)} ${info.mtimeMs} ${createHash("sha256").update(await readFile(full)).digest("hex")}`);
    }
  }
  await walk(dir);
  return lines.join("\n");
}

test("report does not migrate", async t => {
  const dir = await site(t);
  const before = await snapshot(dir);
  const resolveCalls: unknown[] = [];
  const resolvePaths: StorageReportPaths = (required, optional) => { resolveCalls.push(optional); return inSite(dir)(required, optional); };
  await runStorageReportCommand({ dir, measureSiteStorage, resolvePaths, stdout: quiet }, { json: true, env: {} });
  assert.equal(await snapshot(dir), before, "no database opened (no -wal/-shm, no migration), no folder created, nothing touched");
  assert.deepEqual(resolveCalls, [{ reserveIdentity: false }], "the registry identity is never reserved");
});

test("categories add up to the walked total", async t => {
  const dir = await site(t);
  const report = await runStorageReportCommand({ dir, measureSiteStorage, resolvePaths: inSite(dir), stdout: quiet }, { env: {} });
  const sum = Object.values(report.categories).reduce((total, amount) => total + (amount.bytes ?? Number.NaN), 0);
  assert.equal(sum, report.totalBytes);
  assert.equal(report.categories.uploads.bytes, 3000);
  assert.equal(report.categories.logs.bytes, 700);
  assert.equal(report.categories["pre-migration-copies"].bytes, 400);
  assert.equal(report.categories.screenshots.bytes, 900);
  assert.equal(report.categories.other.bytes, 50);
  assert.equal(report.categories.screenshots.class, "yours");
  assert.equal(report.categories["pre-migration-copies"].class, "automatic");
  assert.deepEqual(report.elsewhere, []);
});

test("a symlink is not followed", async t => {
  const dir = await site(t);
  const outside = await realpath(await mkdtemp(path.join(tmpdir(), "storage-report-outside-")));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, "big.bin"), Buffer.alloc(50_000));
  await symlink(outside, path.join(dir, "uploads", "linked"));
  const report = await runStorageReportCommand({ dir, measureSiteStorage, resolvePaths: inSite(dir), stdout: quiet }, { env: {} });
  assert.equal(report.categories.uploads.bytes, 3000, "the linked folder's bytes are not counted");
  assert.deepEqual(report.skippedSymlinks, [path.join(dir, "uploads", "linked")]);
});

test("an unreadable folder is reported unknown, not 0", async t => {
  const dir = await site(t);
  const locked = path.join(dir, ".captures");
  // Containers run tests as root, which ignores chmod 000, so the refusal is injected at open time.
  const deny: StorageTreeFs = {
    lstat: target => nodeStorageTreeFs.lstat(target),
    openDirectory: async target => {
      if (target === locked) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      return nodeStorageTreeFs.openDirectory(target);
    },
  };
  const lines: string[] = [];
  const report = await runStorageReportCommand({
    dir, resolvePaths: inSite(dir), stdout: { write: (chunk: string) => lines.push(chunk) > 0 },
    measureSiteStorage: (required: Parameters<typeof measureSiteStorage>[0]) => measureSiteStorage(required, { fs: deny }),
  }, { env: {} });
  assert.equal(report.categories.screenshots.bytes, null);
  assert.equal(report.totalBytes, null);
  assert.deepEqual(report.unknownPaths, [locked]);
  assert.match(lines[0]!, /^Storage for .+: unknown\n$/);
  assert.ok(lines.includes("  Could not read 1 location(s); their sizes are shown as unknown.\n"));
});

test("WAL is reported apart from the main file", async t => {
  const dir = await site(t);
  await writeFile(path.join(dir, "content.db-wal"), Buffer.alloc(2048));
  const appData = await realpath(await mkdtemp(path.join(tmpdir(), "storage-report-appdata-")));
  t.after(() => rm(appData, { recursive: true, force: true }));
  await writeFile(path.join(appData, "chat.db"), Buffer.alloc(1234));
  await writeFile(path.join(appData, "chat.db-wal"), Buffer.alloc(512));
  const resolvePaths: StorageReportPaths = () => ({ contentDbPath: path.join(dir, "content.db"), chatDbPath: path.join(appData, "chat.db") });
  const report = await runStorageReportCommand({ dir, measureSiteStorage, resolvePaths, stdout: quiet }, { env: {} });
  const mainBytes = (await stat(path.join(dir, "content.db"))).size;
  assert.equal(report.categories["database-wal"].bytes, 2048);
  assert.equal(report.categories["content-database"].bytes, mainBytes, "the WAL never counts as the main file");
  assert.deepEqual(report.databases.map(db => [db.category, db.mainBytes, db.walBytes]), [["content-database", mainBytes, 2048]]);
  assert.deepEqual(report.elsewhere, [{ category: "chat-database", path: path.join(appData, "chat.db"), mainBytes: 1234, walBytes: 512, shmBytes: 0 }]);
});

test("--json prints one JSON document; the default prints plain lines per class", async t => {
  const dir = await site(t);
  const json: string[] = [];
  await runStorageReportCommand({ dir, measureSiteStorage, resolvePaths: inSite(dir), stdout: { write: (chunk: string) => json.push(chunk) > 0 } }, { json: true, env: {} });
  assert.equal(json.length, 1);
  const parsed = JSON.parse(json[0]!);
  assert.deepEqual(Object.keys(parsed).sort(), ["categories", "classes", "databases", "elsewhere", "knownBytes", "siteDir", "skippedSymlinks", "totalBytes", "unknownPaths"]);
  assert.equal(parsed.categories.uploads.bytes, 3000);
  const text: string[] = [];
  await runStorageReportCommand({ dir, measureSiteStorage, resolvePaths: inSite(dir), stdout: { write: (chunk: string) => text.push(chunk) > 0 } }, { env: {} });
  assert.match(text[0]!, /^Storage for .+: [\d.]+ MB\n$/);
  assert.ok(text.some(line => /^ {2}Cleaned automatically: [\d.]+ MB\n$/.test(line)));
  assert.ok(text.some(line => /^ {2}Yours: [\d.]+ MB\n$/.test(line)));
  assert.ok(text.some(line => /^ {2}Shown only: [\d.]+ MB\n$/.test(line)));
});

test("overridden folders follow the same TOVU_*_DIR variables the server reads", async t => {
  const dir = await site(t);
  const { paths } = resolveSiteStorageLocations({ siteDir: dir, ...inSite(dir)({ dir }, { reserveIdentity: false }) }, { env: { TOVU_MEDIA_UPLOADS_DIR: path.join(dir, "media") } });
  assert.equal(paths.find(entry => entry.category === "uploads")?.path, path.join(dir, "media"));
  assert.equal(paths.find(entry => entry.category === "shares")?.path, path.join(dir, "ops", "shares"));
});

test("an outside database with an unreadable sidecar keeps its size unknown in the report", async t => {
  const dir = await site(t);
  const outside = await realpath(await mkdtemp(path.join(tmpdir(), "storage-report-external-")));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const contentDbPath = path.join(outside, "content.db");
  await writeFile(contentDbPath, Buffer.alloc(2048));
  // stat resolves symlinks, so this produces ELOOP without depending on whether the test user is root.
  await symlink("content.db-wal", contentDbPath + "-wal");
  const lines: string[] = [];
  const report = await runStorageReportCommand({
    dir, measureSiteStorage,
    resolvePaths: (input, options) => {
      assert.deepEqual(input, { dir });
      assert.deepEqual(options, { reserveIdentity: false });
      return { contentDbPath, chatDbPath: path.join(dir, "chat.db") };
    },
    stdout: { write: chunk => lines.push(chunk) },
  });
  assert.deepEqual(report.elsewhere, [{ category: "content-database", path: contentDbPath, mainBytes: 2048, walBytes: null, shmBytes: 0 }]);
  assert.deepEqual(report.databases.map(db => db.category), ["chat-database"]);
  assert.equal(lines.at(-1), `  content-database kept outside this folder at ${contentDbPath}: unknown\n`);
});
