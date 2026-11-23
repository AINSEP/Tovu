import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { nodeStorageTreeFs, type StorageTreeFs } from "@jini-ai/platform/retention";
import { SITE_STORAGE_CATEGORY_CLASS, measureSiteStorage } from "../measure.js";

async function siteFolder(t: test.TestContext): Promise<string> {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "tovu-measure-")));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

async function write(root: string, relative: string, bytes: number): Promise<void> {
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.alloc(bytes, 7));
}

/** A site shaped like the real layout: databases with sidecars, uploads, ops copies, logs and a stray file. */
async function sampleSite(t: test.TestContext) {
  const siteDir = await siteFolder(t);
  await write(siteDir, "content.db", 4000);
  await write(siteDir, "content.db-wal", 300);
  await write(siteDir, "content.db-shm", 32);
  await write(siteDir, "chat.db", 1000);
  await write(siteDir, "uploads/2026/photo.jpg", 2500);
  await write(siteDir, "themes/default/style.css", 120);
  await write(siteDir, "ops/pre-migrations-2026-11-01T00-00-00-000Z.db", 800);
  await write(siteDir, "ops/pre-migrations-2026-11-02T00-00-00-000Z.db", 810);
  await write(siteDir, "ops/shares/abc.tovu.zip", 640);
  await write(siteDir, "logs/server.log", 90);
  await write(siteDir, "config.json", 11);
  const at = (relative: string) => path.join(siteDir, relative);
  const paths = [
    { category: "content-database", path: at("content.db") },
    { category: "chat-database", path: at("chat.db") },
    { category: "uploads", path: at("uploads") },
    { category: "themes", path: at("themes") },
    { category: "pre-migration-copies", path: at("ops/pre-migrations-2026-11-01T00-00-00-000Z.db") },
    { category: "pre-migration-copies", path: at("ops/pre-migrations-2026-11-02T00-00-00-000Z.db") },
    { category: "shares", path: at("ops/shares") },
    { category: "logs", path: at("logs") },
  ] as const;
  return { siteDir, paths, at };
}

test("categories add up to the walked total", async (t) => {
  const { siteDir, paths } = await sampleSite(t);
  const report = await measureSiteStorage({ siteDir, paths });
  assert.equal(report.totalBytes, 4000 + 300 + 32 + 1000 + 2500 + 120 + 800 + 810 + 640 + 90 + 11);
  const categorySum = Object.values(report.categories).reduce((sum, amount) => sum + amount.knownBytes, 0);
  const classSum = Object.values(report.classes).reduce((sum, amount) => sum + amount.knownBytes, 0);
  assert.equal(categorySum, report.knownBytes);
  assert.equal(classSum, report.knownBytes);
  assert.equal(report.categories["pre-migration-copies"].bytes, 1610);
  assert.equal(report.categories["pre-migration-copies"].files, 2);
  assert.equal(report.categories.other.bytes, 11, "the stray file is shown, not dropped");
  assert.equal(report.categories.screenshots.bytes, 0, "a category with no path is a known zero");
  assert.deepEqual(report.classes.automatic.bytes, 1610 + 90);
  assert.deepEqual(report.classes.yours.bytes, 4000 + 1000 + 2500 + 120 + 640);
  assert.deepEqual(report.classes["report-only"].bytes, 300 + 32 + 11);
});

test("WAL is reported apart from the main file", async (t) => {
  const { siteDir, paths, at } = await sampleSite(t);
  const report = await measureSiteStorage({ siteDir, paths });
  assert.equal(report.categories["content-database"].bytes, 4000);
  assert.equal(report.categories["database-wal"].bytes, 300);
  assert.equal(report.categories["database-shm"].bytes, 32);
  assert.deepEqual(report.databases, [
    { category: "content-database", path: at("content.db"), mainBytes: 4000, walBytes: 300, shmBytes: 32 },
    { category: "chat-database", path: at("chat.db"), mainBytes: 1000, walBytes: 0, shmBytes: 0 },
  ]);
});

test("a symlink is not followed", async (t) => {
  const { siteDir, paths, at } = await sampleSite(t);
  const elsewhere = await siteFolder(t);
  await write(elsewhere, "big.bin", 99_999);
  await fs.symlink(elsewhere, at("uploads/linked"));
  const report = await measureSiteStorage({ siteDir, paths });
  assert.equal(report.categories.uploads.bytes, 2500);
  assert.deepEqual(report.skippedSymlinks, [at("uploads/linked")]);
});

test("an unreadable folder is reported unknown, not 0", async (t) => {
  const { siteDir, paths, at } = await sampleSite(t);
  const locked = at("uploads/2026");
  // Containers run tests as root, which ignores chmod 000, so the refusal is injected.
  const deny: StorageTreeFs = {
    lstat: (target) => nodeStorageTreeFs.lstat(target),
    // The walk now opens each folder (no-follow) and lists it through the handle, so the refusal is
    // injected at open time — the same point a real EACCES surfaces.
    openDirectory: async (target) => {
      if (target === locked) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      return nodeStorageTreeFs.openDirectory(target);
    },
  };
  const report = await measureSiteStorage({ siteDir, paths }, { fs: deny });
  assert.equal(report.categories.uploads.bytes, null);
  assert.equal(report.categories.uploads.knownBytes, 0);
  assert.equal(report.classes.yours.bytes, null, "the class holding the unknown folder is unknown");
  assert.equal(report.classes.automatic.bytes, 1700, "other classes stay exact");
  assert.equal(report.totalBytes, null);
  assert.deepEqual(report.unknownPaths, [locked]);
});

test("every category has a fixed class; owner content is never automatic", () => {
  assert.equal(SITE_STORAGE_CATEGORY_CLASS["content-database"], "yours");
  assert.equal(SITE_STORAGE_CATEGORY_CLASS.uploads, "yours");
  assert.equal(SITE_STORAGE_CATEGORY_CLASS.screenshots, "yours");
  assert.equal(SITE_STORAGE_CATEGORY_CLASS["database-wal"], "report-only");
  assert.equal(SITE_STORAGE_CATEGORY_CLASS["pre-migration-copies"], "automatic");
  assert.equal(SITE_STORAGE_CATEGORY_CLASS.other, "report-only");
});

test("measuring is read-only: no file changes, appears or disappears", async (t) => {
  const { siteDir, paths } = await sampleSite(t);
  const snapshot = async () => (await fs.readdir(siteDir, { recursive: true })).sort().join("\n");
  const before = await snapshot();
  await measureSiteStorage({ siteDir, paths });
  assert.equal(await snapshot(), before);
});

test("a location outside the website folder is refused in plain words", async (t) => {
  const siteDir = await siteFolder(t);
  await assert.rejects(
    measureSiteStorage({ siteDir, paths: [{ category: "uploads", path: path.join(path.dirname(siteDir), "uploads") }] }),
    { name: "RangeError", message: `This storage location is outside the website folder: ${path.join(path.dirname(siteDir), "uploads")}` },
  );
  await assert.rejects(
    measureSiteStorage({ siteDir, paths: [{ category: "uploads", path: "uploads" }] }),
    { name: "TypeError", message: "This storage location must be a full path: uploads" },
  );
});
