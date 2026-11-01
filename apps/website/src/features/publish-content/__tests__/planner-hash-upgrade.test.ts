import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { contentHash } from "../content-hash.js";

// Simulate the next release without changing the actual wire format or stored v1 rows.
mock.module(new URL("../content-hash.ts", import.meta.url).href, {
  namedExports: { CONTENT_HASH_VERSION: 2, contentHash },
});
const { planImport, entityKey } = await import("../planner.js");
const { registerPublishContentContributor, resetPublishContentContributorsForTests } = await import("../type-registry.js");

test("v2 planner re-baselines stored v1/unknown history without trusting obsolete hashes", async () => {
  resetPublishContentContributorsForTests();
  const destination = new Map([
    ["same", { version: 1, hash: "current-same" }],
    ["edited", { version: 1, hash: "old-hash" }],
    ["seed", { version: 1, hash: "current-seed" }],
  ]);
  registerPublishContentContributor({ entityType: "widget", dependsOn: [], build: () => ({
    entityType: "widget", schemaVersion: 1, permission: "content.write", dependsOn: [],
    pack: async function* () {}, inspect: async id => destination.get(id) ?? null,
    precheck: async () => null, apply: async () => { assert.fail("planning must never write"); },
    seedHash: async id => id === "seed" ? "current-seed" : null,
  }) });
  const entities = ["same", "edited", "seed", "new"].map(id => ({
    entityType: "widget", id, schemaVersion: 1, hashVersion: 2,
    contentHash: id === "same" ? "current-same" : "incoming", requiredBlobs: [], state: {},
  }));
  const bundle = { artifactFormatVersion: 1, hashVersion: 2, entities };
  const before = JSON.stringify([...destination]);
  for (const version of [1, 99]) {
    const deps = { publishContentDeps: {} as Parameters<typeof planImport>[1]["publishContentDeps"],
      getBaseline: async () => ({ hashVersion: version, hashAtLastSync: "old-hash" }), hasBlob: async () => true };
    const report = await planImport(bundle, deps);
    assert.equal(report.refused, false);
    assert.deepEqual(report.rows.map(row => row.outcome), ["unchanged", "conflict", "applied", "created"]);
    assert.equal(report.rows[1].writes, false, "even coincidentally equal obsolete hashes cannot authorize an overwrite");
    assert.match(report.rows[1].reason!, /no prior sync baseline/);
    const forced = await planImport(bundle, { ...deps, forcedEntityKeys: new Set([entityKey("widget", "edited")]) });
    assert.equal(forced.rows[1].outcome, "forced", "the existing explicit confirmation path can establish new history");
    assert.equal(JSON.stringify([...destination]), before);
  }
});

test("v2 importer tells a v1 exporter to upgrade and re-export; v3 bundles require this importer to upgrade", async () => {
  const deps = { publishContentDeps: {} as Parameters<typeof planImport>[1]["publishContentDeps"],
    getBaseline: async () => { assert.fail("incompatible bundles must refuse before reading history"); }, hasBlob: async () => true };
  const older = await planImport({ artifactFormatVersion: 1, hashVersion: 1, entities: [] }, deps);
  assert.equal(older.refused, true);
  assert.match(older.refusalReason!, /upgrade the exporting instance.*re-export/i);
  const newer = await planImport({ artifactFormatVersion: 1, hashVersion: 3, entities: [] }, deps);
  assert.equal(newer.refused, true);
  assert.match(newer.refusalReason!, /upgrade this importing instance/i);
});

test("v2 apply replaces v1 baselines for matching and seed-matched rows, preserving edited rows", async () => {
  // Isolate the unrelated restore/backstop entrypoints; planner, apply loop and stored repos are real.
  mock.module(new URL("../gated-hooks.ts", import.meta.url).href, {
    namedExports: { PublishContentBundleNotFoundError: class extends Error {} },
  });
  mock.module(new URL("../backstop-service.ts", import.meta.url).href, {
    namedExports: { readBackstopMetadata: () => null },
  });
  const { createPublishContentApplyPort } = await import("../apply-loop.js");
  const { InMemoryPublishContentBaselineRepo } = await import("../baseline-repo.js");
  const { InMemoryPublishContentBundleRepo, stageBundle } = await import("../bundle-staging.js");
  const { InMemoryPublishContentRunRepo } = await import("../run-repo.js");
  resetPublishContentContributorsForTests();
  const baselineRepo = new InMemoryPublishContentBaselineRepo();
  const bundleRepo = new InMemoryPublishContentBundleRepo();
  const runRepo = new InMemoryPublishContentRunRepo();
  const clock = { nowMs: () => Date.parse("2026-10-31T00:00:00Z") };
  let serial = 0;
  const idGen = { newId: () => `upgrade-${++serial}` };
  const destination = new Map(["same", "seed", "edited"].map(id => [id, { version: 1, hash: `current-${id}` }]));
  const entities = ["same", "seed", "edited"].map(id => ({
    entityType: "widget", id, schemaVersion: 1, hashVersion: 2,
    contentHash: id === "same" ? "current-same" : "incoming", requiredBlobs: [], state: {},
  }));
  const writes: string[] = [];
  registerPublishContentContributor({ entityType: "widget", dependsOn: [], build: () => ({
    entityType: "widget", schemaVersion: 1, permission: "content.write", dependsOn: [],
    pack: async function* () {}, inspect: async id => destination.get(id) ?? null,
    precheck: async () => null, seedHash: async id => id === "seed" ? "current-seed" : null,
    apply: async ({ entity }) => {
      writes.push(entity.id); destination.set(entity.id, { version: 2, hash: entity.contentHash });
      return { changeSetId: `change-${entity.id}` };
    },
  }) });
  const key = (id: string) => ({ workspaceId: "ws", peerPrincipalId: "peer", entityType: "widget", entityId: id });
  for (const entity of entities) await baselineRepo.upsert({ ...key(entity.id), hashVersion: 1,
    hashAtLastSync: "obsolete", syncedAt: "2026-10-01T00:00:00Z", runId: "v1-run" });
  const publishContentDeps = { workspaceId: "ws", ports: {}, clock, idGen };
  const bundle = { artifactFormatVersion: 1, hashVersion: 2, entities };
  const report = await planImport(bundle, { publishContentDeps,
    getBaseline: input => baselineRepo.findOne(key(input.entityId)), hasBlob: async () => true });
  assert.deepEqual(report.rows.map(row => row.outcome), ["unchanged", "applied", "conflict"]);
  const staged = await stageBundle({ ...bundle, workspaceId: "ws", sourcePrincipalId: "peer", blobManifest: [] }, { repo: bundleRepo, clock, idGen });
  const port = createPublishContentApplyPort({ workspaceId: "ws", bundleRepo, baselineRepo, runRepo, publishContentDeps, clock, idGen });
  await port.applyReport({ report, bundleId: staged.bundleId, principalId: "owner", restorePointId: "restore" });
  assert.deepEqual(writes, ["seed"], "a current seed match must remain applicable at execute time");
  for (const id of ["same", "seed"]) {
    const baseline = await baselineRepo.findOne(key(id));
    assert.equal(baseline?.hashVersion, 2);
    assert.equal(baseline?.hashAtLastSync, destination.get(id)!.hash);
  }
  assert.equal((await baselineRepo.findOne(key("edited")))?.hashVersion, 1);
  assert.equal(destination.get("edited")!.hash, "current-edited");
});
