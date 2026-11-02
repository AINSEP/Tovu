import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { posts } from "#src/platform/db/schema.sqlite";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { loadSqliteSeedDeps } from "../publish-content-seed-hash.js";

/** The seed lookup's ports bag: a missing seed is `null`, and every port no `inspect()` reads is a
 * stand-in that throws loudly on first use instead of hashing against the wrong store. */

const clock = createFakeClock({ startIso: "2026-09-24T00:00:00.000Z" });
const idGen = { newId: () => "id-1" };

test("no shipped seed file means no seed deps", () => {
  assert.equal(loadSqliteSeedDeps({ seedDbPath: "/nonexistent/content.seed.db", workspaceId: "ws", clock, idGen, redirectsWriteDeps: {} as never }), null);
});

test("ports no inspect() reads throw a labelled error on first touch, including the stamp-watermark port", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "seed-hash-load-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const seedDbPath = join(dir, "content.seed.db");
  openContentDb(seedDbPath).$client.close();
  const deps = loadSqliteSeedDeps({ seedDbPath, workspaceId: "ws", clock, idGen, redirectsWriteDeps: {} as never });
  assert.ok(deps, "the seed lookup must load the fixture");
  assert.equal(deps.workspaceId, "ws");
  const ports = deps.ports as unknown as Record<string, Record<string, unknown>>;
  for (const [read, label] of [
    [() => (ports.media!.blobStore as Record<string, unknown>).put, "media.blobStore"],
    [() => (ports.menu!.bindingRepo as Record<string, unknown>).list, "menu.bindingRepo"],
    [() => (ports.taxonomy!.stampWatermark as () => void)(), "stampWatermark"],
  ] as const) {
    assert.throws(read, { message: `publish-content-seed-hash: '${label}' was read by an inspect() call, but this seed lookup never wires it for real use` });
  }
});

for (const valid of [true, false]) {
  test(`seed loading leaves no temporary database after ${valid ? "success" : "an invalid seed"}`, async t => {
    const dir = mkdtempSync(join(tmpdir(), "seed-hash-cleanup-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const seedDbPath = join(dir, "content.seed.db");
    const bodyJson = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Stock seed content" }] }] };
    if (valid) {
      const db = openContentDb(seedDbPath);
      try {
        assert.equal(db.$client.pragma("journal_mode", { simple: true }), "wal", "exercise the WAL mode used by shipped content seeds");
        db.insert(posts).values({ id: "seed-post", workspaceId: "ws", title: "Stock post", slug: "stock-post",
          bodyJson: JSON.stringify(bodyJson), status: "published", updatedAt: clock.nowIso(), version: 1 }).run();
      } finally { db.$client.close(); }
    } else writeFileSync(seedDbPath, "not a database");
    const original = readFileSync(seedDbPath);
    const seedFiles = readdirSync(dir).sort();
    if (valid) {
      assert.deepEqual([...original.subarray(18, 20)], [2, 2], "the closed seed must still have a WAL-mode header");
      assert.deepEqual(seedFiles, ["content.seed.db"], "closing the fixture must checkpoint its content into the complete seed file");
    }
    const before = new Set(readdirSync(tmpdir()));
    const input = { seedDbPath, workspaceId: "ws", clock, idGen, redirectsWriteDeps: {} as never };
    try {
      if (valid) {
        const deps = loadSqliteSeedDeps(input);
        assert.ok(deps, "valid seed must remain readable without its disk copy");
        const post = await deps.ports.post!.repo.findById({ workspaceId: "ws", id: "seed-post" });
        assert.ok(post, "the deserialized WAL seed must contain its saved post");
        assert.equal(post.title, "Stock post");
        assert.deepEqual(post.bodyJson, bodyJson, "read actual persisted content, not only a missing-row lookup");
        assert.equal(await deps.ports.post!.repo.findById({ workspaceId: "ws", id: "absent" }), null);
      } else assert.throws(() => loadSqliteSeedDeps(input));
      assert.deepEqual(readFileSync(seedDbPath), original, "the shipped seed must never be mutated");
      assert.deepEqual(readdirSync(dir).sort(), seedFiles, "loading must leave no database copies or journal sidecars beside the seed");
      const leaked = readdirSync(tmpdir()).filter(name => name.startsWith("tovu-publish-seed-") && !before.has(name));
      t.after(() => { for (const name of leaked) rmSync(join(tmpdir(), name), { recursive: true, force: true }); });
      assert.deepEqual(leaked, [], "success and failure must both leave no seed copy on disk");
    } finally {
      // Also clean up a red run whose seed open failed before the leak assertion.
      for (const name of readdirSync(tmpdir())) {
        if (name.startsWith("tovu-publish-seed-") && !before.has(name)) rmSync(join(tmpdir(), name), { recursive: true, force: true });
      }
    }
  });
}
