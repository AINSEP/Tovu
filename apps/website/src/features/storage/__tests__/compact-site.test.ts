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
