/**
 * Export (site share) must never write into the source site's storage (Codex check 2026-10-26): the
 * database snapshot used to be created and deleted beside the live `content.db`. These tests use the
 * real SQLite `DbOpsPort` adapter on a file database inside the site folder. Each removes its folder.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type { DbOpsPort } from "#src/contracts/core/gated-mutations/ports";
import { SqliteDbOpsAdapter } from "#src/platform/db/sqlite/db-ops";
import { openPreparedContentDb } from "../../../platform/db/sqlite/__tests__/helpers/open-prepared-content-db.js";
import { resolveAgentPluginLayout } from "../../agent-plugins/layout.js";
import { prepareShareContent } from "../share-preparation.js";
import { captureDatabaseSnapshot } from "../sources.js";

/** Every path under `dir`, relative and sorted, so before/after listings compare exactly. */
function listTree(dir: string): string[] {
  return fs.readdirSync(dir, { recursive: true, encoding: "utf8" }).sort();
}

async function sourceSite(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-share-snapshot-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const siteDir = path.join(root, "site"), snapshotRoot = path.join(root, "private");
  fs.mkdirSync(path.join(siteDir, "data.nosync"), { recursive: true });
  fs.mkdirSync(snapshotRoot);
  const filePath = path.join(siteDir, "data.nosync", "content.db");
  const db = await openPreparedContentDb(filePath);
  t.after(() => db.$client.close());
  const real = new SqliteDbOpsAdapter({ db, filePath });
  const captured: string[] = [];
  const dbOps: DbOpsPort = {
    getCapabilities: () => real.getCapabilities(),
    captureRestorePoint: async (required, optional) => { const point = await real.captureRestorePoint(required, optional); captured.push(point.artifactRef); return point; },
    restoreFromArtifact: async () => assert.fail("an export never restores"),
  };
  return { root, siteDir, snapshotRoot, dbOps, captured };
}

test("export snapshots the database into the injected private folder, never the source site, and leaves nothing behind", async t => {
  const h = await sourceSite(t);
  const before = listTree(h.siteDir);
  const snapshots: number[] = [];
  await prepareShareContent({
    dbOps: h.dbOps, snapshotRoot: h.snapshotRoot,
    sources: { siteDir: h.siteDir, themesDir: path.join(h.siteDir, "themes"), skillsDir: path.join(h.siteDir, "skills"), mediaUploadsDir: null, agentPlugins: resolveAgentPluginLayout({ siteDir: h.siteDir, env: {} }), tovuVersion: "test" },
    sanitize: async ({ snapshot }) => { snapshots.push(snapshot.length); return { bytes: Buffer.from("projected"), media: [] }; },
    rewriteMedia: async ({ bytes }) => bytes, imageTransformer: { transform: async () => assert.fail("no media") },
    blobStore: { sizeOf: async () => assert.fail("no media"), get: async () => assert.fail("no media") },
  });
  assert.equal(h.captured.length, 1);
  const artifact = h.captured[0]!;
  assert.ok(artifact.startsWith(h.snapshotRoot + path.sep), `snapshot ${artifact} must be inside ${h.snapshotRoot}`);
  assert.ok(!artifact.startsWith(h.siteDir + path.sep), `snapshot ${artifact} must not be inside the source site`);
  assert.ok(snapshots[0]! > 0, "the sanitizer still receives the real snapshot bytes");
  assert.deepEqual(listTree(h.siteDir), before, "the source site folder is unchanged");
  assert.deepEqual(fs.readdirSync(h.snapshotRoot), [], "the private snapshot folder is removed after the read");
});

test("the private snapshot folder is removed even when the capture fails", async t => {
  const h = await sourceSite(t);
  const failing: DbOpsPort = { ...h.dbOps, captureRestorePoint: async (_required, optional) => {
    const directory = optional?.directory;
    assert.ok(directory !== undefined && directory.startsWith(h.snapshotRoot + path.sep));
    fs.writeFileSync(path.join(directory, "partial.db"), "half written");
    throw new Error("disk full");
  } };
  const result = await captureDatabaseSnapshot({ dbOps: failing, scopeId: "site-share" }, { snapshotRoot: h.snapshotRoot });
  assert.deepEqual({ ok: result.ok, message: result.ok ? undefined : result.message }, { ok: false, message: "the database snapshot failed; nothing was backed up" });
  assert.deepEqual(fs.readdirSync(h.snapshotRoot), []);
});

test("a missing snapshot root refuses with the caller-safe message and captures nothing", async t => {
  const h = await sourceSite(t);
  const result = await captureDatabaseSnapshot({ dbOps: h.dbOps, scopeId: "site-share" }, { snapshotRoot: path.join(h.root, "missing") });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? "" : result.message, "the database snapshot failed; nothing was backed up");
  assert.match(result.ok ? "" : result.logDetail ?? "", /ENOENT/);
  assert.deepEqual(h.captured, []);
});
