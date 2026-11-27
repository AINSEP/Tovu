import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compactStoppedSite } from "../compact-site.js";
import { compactionMarkerStore } from "../compaction-marker.js";
import { nodeRestoreFs } from "../compaction-recovery-ports.js";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { processCopyCoordinator } from "#src/platform/db/sqlite/copy-coordinator";

test("refused while the site is running", async () => {
  let released = 0;
  const result = await compactStoppedSite({ dir: "/site",
    claim: () => ({ attached: {}, isHeld: () => false, release: () => { released += 1; } }),
    resolvePaths: () => assert.fail("paths must not be resolved"),
    open: () => assert.fail("database must not open"),
    markerStore: () => assert.fail("marker must not open"),
    fs: { ...nodeRestoreFs, lstat: fs.lstat, realpath: fs.realpath, deviceOf: async () => "device", publish: nodeRestoreFs.renameAtomic, tempDirectory: os.tmpdir },
    copyMutex: processCopyCoordinator, convert: async () => assert.fail("must not convert"), now: () => 1,
  }, {});
  assert.equal(result.status, "partial");
  assert.equal(released, 0);
});

test("one database defers and the other is attempted", async t => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "compact-site-")));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const contentDbPath = path.join(dir, "content.db");
  const chatDbPath = path.join(dir, "chat.db");
  for (const file of [contentDbPath, chatDbPath]) {
    const db = openNativeSqlite(file);
    db.exec("CREATE TABLE fixture (value TEXT)");
    db.close();
  }
  const order: string[] = [];
  const result = await compactStoppedSite({ dir,
    claim: () => ({ attached: null, isHeld: () => true, release: () => { order.push("release"); } }),
    resolvePaths: (_required, optional) => { assert.deepEqual(optional, { reserveIdentity: false }); return { storage: { kind: "sqlite" }, contentDbPath, chatDbPath }; },
    open: openNativeSqlite,
    markerStore: ({ opsDir, lease }) => compactionMarkerStore({ opsDir, files: fs, lease }, {}),
    fs: { ...nodeRestoreFs, lstat: fs.lstat, realpath: fs.realpath, deviceOf: async () => "device", publish: nodeRestoreFs.renameAtomic, tempDirectory: os.tmpdir },
    copyMutex: processCopyCoordinator,
    convert: async ({ filePath, holdsRunningLease }) => {
      assert.equal(holdsRunningLease(), true);
      order.push(path.basename(filePath));
      return filePath === contentDbPath
        ? { status: "deferred", reason: "busy", message: "Busy" }
        : { status: "already-converted", message: "Ready" };
    }, now: () => 1,
  }, {});
  assert.equal(result.status, "partial");
  assert.deepEqual(order, ["content.db", "chat.db", "release"]);
});

test("boot unaffected when preflight fails", async t => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "compact-marker-")));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "maintenance.json");
  const store = compactionMarkerStore({ opsDir: dir, files: fs, lease: { isHeld: () => true } }, {});
  const content = store.forDatabase({ name: "content" }, {});
  assert.equal(await content.read(), undefined);
  const marker = { state: "needs-attention" as const, recoveryCopyPath: "/copy.db", at: 1, reason: "failed check" };
  await content.write(marker);
  assert.deepEqual(await content.read(), marker);
  assert.equal(await store.forDatabase({ name: "chat" }, {}).read(), undefined);
  await fs.writeFile(file, "damaged");
  await assert.rejects(content.read());
  assert.equal(await fs.readFile(file, "utf8"), "damaged");
});

test("linked and non-file database paths are deferred without conversion or changing their bytes", async t => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "compact-unsafe-")));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, "unmanaged.db");
  const contentDbPath = path.join(dir, "content.db");
  const chatDbPath = path.join(dir, "chat.db");
  await fs.writeFile(source, "unmanaged bytes");
  await fs.link(source, contentDbPath);
  await fs.mkdir(chatDbPath);
  let releases = 0;
  const result = await compactStoppedSite({
    dir,
    claim: required => {
      assert.deepEqual(required, { dir, purpose: "maintenance" });
      return { attached: null, isHeld: () => true, release: () => { releases++; } };
    },
    resolvePaths: () => ({ storage: { kind: "sqlite" }, contentDbPath, chatDbPath }),
    open: () => assert.fail("unmanaged files must not be opened"),
    markerStore: ({ opsDir, lease }) => compactionMarkerStore({ opsDir, files: fs, lease }, {}),
    fs: { ...nodeRestoreFs, lstat: fs.lstat, realpath: fs.realpath, deviceOf: async () => "device", publish: nodeRestoreFs.renameAtomic, tempDirectory: os.tmpdir },
    copyMutex: processCopyCoordinator,
    convert: async () => assert.fail("unmanaged files must not be converted"),
    now: () => 1,
  });
  const deferred = { status: "deferred", reason: "needs-attention", message: "The database file is linked or is not a plain file; nothing was changed." };
  assert.deepEqual(result, { status: "partial", databases: [{ name: "content", outcome: deferred }, { name: "chat", outcome: deferred }] });
  assert.equal(await fs.readFile(source, "utf8"), "unmanaged bytes");
  assert.equal((await fs.stat(contentDbPath)).nlink, 2);
  assert.deepEqual(await fs.readdir(chatDbPath), []);
  assert.equal(releases, 1);
});

test("clearing a content marker persists across reopened stores without removing the chat marker", async t => {
  const opsDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "compact-clear-")));
  t.after(() => fs.rm(opsDir, { recursive: true, force: true }));
  const reopen = () => compactionMarkerStore({ opsDir, files: fs, lease: { isHeld: () => true } });
  const initial = reopen();
  const content = { state: "rewriting", recoveryCopyPath: "/content-copy.db", at: 71 } as const;
  const chat = { state: "converted", recoveryCopyPath: "/chat-copy.db", at: 92, identity: "7:9" } as const;
  await initial.forDatabase({ name: "content" }).write(content);
  await initial.forDatabase({ name: "chat" }).write(chat);
  const before = reopen();
  assert.deepEqual(await before.forDatabase({ name: "content" }).read(), content);
  await before.forDatabase({ name: "content" }).clear();
  const after = reopen();
  assert.equal(await after.forDatabase({ name: "content" }).read(), undefined);
  assert.deepEqual(await after.forDatabase({ name: "chat" }).read(), chat);
});

test("a plain file behind a linked parent remains unmanaged even with a single link", async t => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "compact-linked-parent-")));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const external = path.join(dir, "unmanaged");
  const alias = path.join(dir, "linked");
  await fs.mkdir(external);
  const original = path.join(external, "content.db");
  await fs.writeFile(original, "outside the managed path");
  await fs.symlink(external, alias, "junction");
  const contentDbPath = path.join(alias, "content.db");
  let released = false;
  const result = await compactStoppedSite({
    dir,
    claim: () => ({ attached: null, isHeld: () => true, release: () => { released = true; } }),
    resolvePaths: () => ({ storage: { kind: "sqlite" }, contentDbPath, chatDbPath: path.join(dir, "unused-chat.db") }),
    open: () => assert.fail("the symlinked parent is not a managed database path"),
    markerStore: ({ opsDir, lease }) => compactionMarkerStore({ opsDir, files: fs, lease }, {}),
    fs: { ...nodeRestoreFs, lstat: fs.lstat, realpath: fs.realpath, deviceOf: async () => "device", publish: nodeRestoreFs.renameAtomic, tempDirectory: os.tmpdir },
    copyMutex: processCopyCoordinator,
    convert: async () => assert.fail("linked parents must not be converted"),
    now: () => 1,
  }, { databases: ["content"] });
  assert.deepEqual(result, { status: "partial", databases: [{ name: "content", outcome: {
    status: "deferred", reason: "needs-attention", message: "The database file is linked or is not a plain file; nothing was changed.",
  } }] });
  assert.equal((await fs.stat(original)).nlink, 1);
  assert.equal(await fs.readFile(original, "utf8"), "outside the managed path");
  assert.equal(released, true);
});
