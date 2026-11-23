/**
 * @file P11 ST-16 (report half): `tovu storage report <dir> [--json]` measures a website folder
 * without booting it. It opens no database, claims no lease, writes no registry entry and creates no
 * folder — so it is safe beside a running site. Clean and compact are later slices (ST-6/ST-7b).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";

import { resolveSiteStorageLocations, runStorageReportCommand } from "../storage-report.js";

async function site(t: TestContext): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "storage-report-"));
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
  return dir;
}

const inSite = (dir: string) => () => ({ contentDbPath: path.join(dir, "content.db"), chatDbPath: path.join(dir, "chat.db") });

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

test("report does not migrate, open a database, or create anything", async t => {
  const dir = await site(t);
  const before = await snapshot(dir);
  await runStorageReportCommand({ dir, json: true, env: {}, resolveDatabases: inSite(dir), write: () => {} });
  assert.equal(await snapshot(dir), before);
});

test("the report files each location under its category and class", async t => {
  const dir = await site(t);
  const report = await runStorageReportCommand({ dir, env: {}, resolveDatabases: inSite(dir), write: () => {} });
  assert.equal(report.categories.uploads.bytes, 3000);
  assert.equal(report.categories.logs.bytes, 700);
  assert.equal(report.categories["pre-migration-copies"].bytes, 400);
  assert.equal(report.categories.screenshots.bytes, 900);
  assert.equal(report.categories.screenshots.class, "yours");
  assert.equal(report.categories["pre-migration-copies"].class, "automatic");
  assert.ok((report.categories["content-database"].bytes ?? 0) > 0);
  assert.deepEqual(report.elsewhere, []);
});

test("a database kept outside the website folder is listed apart, with its size, not refused", async t => {
  const dir = await site(t);
  const appData = await mkdtemp(path.join(tmpdir(), "storage-report-appdata-"));
  t.after(() => rm(appData, { recursive: true, force: true }));
  await writeFile(path.join(appData, "content.db"), Buffer.alloc(1234));
  const report = await runStorageReportCommand({ dir, env: {}, write: () => {},
    resolveDatabases: () => ({ contentDbPath: path.join(appData, "content.db"), chatDbPath: path.join(dir, "chat.db") }) });
  assert.deepEqual(report.elsewhere, [{ category: "content-database", path: path.join(appData, "content.db"), mainBytes: 1234, walBytes: 0, shmBytes: 0 }]);
  assert.ok((report.categories["chat-database"].bytes ?? 0) > 0);
});

test("--json prints one JSON document; the default prints plain lines per class", async t => {
  const dir = await site(t);
  const json: string[] = [];
  await runStorageReportCommand({ dir, json: true, env: {}, resolveDatabases: inSite(dir), write: ({ line }) => json.push(line) });
  assert.equal(json.length, 1);
  assert.equal(JSON.parse(json[0]!).categories.uploads.bytes, 3000);
  const text: string[] = [];
  await runStorageReportCommand({ dir, env: {}, resolveDatabases: inSite(dir), write: ({ line }) => text.push(line) });
  assert.match(text[0]!, /^Storage for .+: [\d.]+ MB$/);
  assert.ok(text.includes("  Cleaned automatically: 0.0 MB"));
  assert.ok(text.some(line => /^ {2}Yours: [\d.]+ MB$/.test(line)));
  assert.ok(text.some(line => /^ {2}Shown only: [\d.]+ MB$/.test(line)));
});

test("overridden folders follow the same TOVU_*_DIR variables the server reads", async t => {
  const dir = await site(t);
  const { paths } = resolveSiteStorageLocations({ siteDir: dir, ...inSite(dir)() }, { env: { TOVU_MEDIA_UPLOADS_DIR: path.join(dir, "media") } });
  assert.equal(paths.find(entry => entry.category === "uploads")?.path, path.join(dir, "media"));
  assert.equal(paths.find(entry => entry.category === "shares")?.path, path.join(dir, "ops", "shares"));
});
