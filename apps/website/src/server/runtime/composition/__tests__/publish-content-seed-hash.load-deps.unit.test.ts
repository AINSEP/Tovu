import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
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
  assert.ok(deps);
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
