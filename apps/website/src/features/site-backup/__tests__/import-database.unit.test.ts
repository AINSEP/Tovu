import assert from "node:assert/strict";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SiteShareRefusal } from "@jini-ai/devops/backup/site/share-refusal";
import { rebuildImportDatabase } from "../import-database.js";

const request = { snapshot: Buffer.from("database fixture"), moduleUrl: import.meta.url };
const insufficientSpace = (error: unknown) => error instanceof SiteShareRefusal &&
  error.code === "INSUFFICIENT_STORAGE" && error.message === "Not enough private staging space to verify this database.";

test("the default import stages under a marked, locked root and removes it after refusal", async () => {
  const roots: string[] = [];
  await assert.rejects(rebuildImportDatabase(request, {
    statfs: async root => {
      roots.push(root);
      assert.equal(path.dirname(root), tmpdir());
      assert.match(path.basename(root), /^tovu-import-db-[a-f0-9-]{36}$/);
      assert.deepEqual(JSON.parse(await readFile(root + ".owner", "utf8")), { version: 1, prefix: "tovu-import-db-" });
      assert.equal((await lstat(root)).isDirectory(), true);
      await lstat(root + ".lock");
      return { bavail: 0, bsize: 4096 };
    },
    fork: () => assert.fail("the database worker must not start without private staging space"),
  }), insufficientSpace);
  assert.equal(roots.length, 1);
  const root = roots[0]!;
  for (const suffix of ["", ".owner", ".lock"]) {
    await assert.rejects(lstat(root + suffix), { code: "ENOENT" });
  }
});

test("an explicitly owned import root takes precedence over the host default", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "isolated-import-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const events: string[] = [];
  await assert.rejects(rebuildImportDatabase(request, {
    tempRoot: async ({ work }) => {
      events.push("own root");
      try { return await work({ root }); } finally { events.push("release root"); }
    },
    statfs: async actual => {
      assert.equal(actual, root);
      events.push("measure root");
      return { bavail: 0, bsize: 4096 };
    },
    fork: () => assert.fail("the database worker must not start without private staging space"),
  }), insufficientSpace);
  assert.deepEqual(events, ["own root", "measure root", "release root"]);
});
