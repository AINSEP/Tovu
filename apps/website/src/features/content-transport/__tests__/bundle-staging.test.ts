import assert from "node:assert/strict";
import test from "node:test";

import {
  computeBundleExpiry,
  CONTENT_TRANSPORT_BUNDLE_TTL_MS,
  InMemoryContentTransportBundleRepo,
  isBundleActive,
  loadActiveBundle,
  stageBundle,
  type StagedBundleRecord,
} from "../bundle-staging.js";

/**
 * @file Task 6 of the content-transport (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 6.
 *
 * Pins: `expiresAt` is always server-computed from `receivedAt` + TTL (never caller-supplied), and
 * — the dispatch's own required test — a bundle past its `expiresAt` is refused by
 * {@link loadActiveBundle}, not silently served.
 */

function fakeClock(nowIso: string) {
  return { nowIso: () => nowIso };
}

function fakeIdGen(id: string) {
  return { newId: () => id };
}

test("stageBundle computes expiresAt as receivedAt + TTL, never from caller input", async () => {
  const repo = new InMemoryContentTransportBundleRepo();
  const receivedAt = "2026-09-18T00:00:00.000Z";
  const { bundleId, expiresAt } = await stageBundle(
    { workspaceId: "ws-1", sourcePrincipalId: "principal-1", hashVersion: 1, entities: [], blobManifest: [] },
    { repo, clock: fakeClock(receivedAt), idGen: fakeIdGen("bundle-1") }
  );

  assert.equal(bundleId, "bundle-1");
  assert.equal(expiresAt, new Date(new Date(receivedAt).getTime() + CONTENT_TRANSPORT_BUNDLE_TTL_MS).toISOString());

  const stored = await repo.findById({ workspaceId: "ws-1", id: "bundle-1" });
  assert.ok(stored);
  assert.equal(stored?.receivedAt, receivedAt);
  assert.equal(stored?.expiresAt, expiresAt);
});

test("stageBundle serializes entities/blobManifest and records sourcePrincipalId as the AUTHENTICATED pusher", async () => {
  const repo = new InMemoryContentTransportBundleRepo();
  const entities = [{ entityType: "post", id: "p-1" }];
  const blobManifest = ["a".repeat(64)];
  await stageBundle(
    {
      workspaceId: "ws-1",
      sourcePrincipalId: "principal-1",
      hashVersion: 1,
      sourceLabel: "peer A",
      entities,
      blobManifest,
    },
    { repo, clock: fakeClock("2026-09-18T00:00:00.000Z"), idGen: fakeIdGen("bundle-2") }
  );

  const stored = await repo.findById({ workspaceId: "ws-1", id: "bundle-2" });
  assert.ok(stored);
  assert.equal(stored?.sourcePrincipalId, "principal-1");
  assert.deepEqual(JSON.parse(stored?.entitiesJson ?? "[]"), entities);
  assert.deepEqual(JSON.parse(stored?.blobManifestJson ?? "[]"), blobManifest);
});

test("isBundleActive is true exactly at the expiresAt boundary (inclusive), false just after", () => {
  const record: StagedBundleRecord = {
    id: "b-1",
    workspaceId: "ws-1",
    sourcePrincipalId: "principal-1",
    hashVersion: 1,
    entitiesJson: "[]",
    blobManifestJson: "[]",
    sizeBytes: 4,
    receivedAt: "2026-09-18T00:00:00.000Z",
    expiresAt: "2026-09-19T00:00:00.000Z",
  };
  assert.equal(isBundleActive({ record, now: "2026-09-19T00:00:00.000Z" }), true);
  assert.equal(isBundleActive({ record, now: "2026-09-19T00:00:00.001Z" }), false);
});

test("loadActiveBundle REFUSES (returns null for) a bundle past its expiresAt — required Task 6 property", async () => {
  const repo = new InMemoryContentTransportBundleRepo();
  const receivedAt = "2026-09-18T00:00:00.000Z";
  const { bundleId, expiresAt } = await stageBundle(
    { workspaceId: "ws-1", sourcePrincipalId: "principal-1", hashVersion: 1, entities: [], blobManifest: [] },
    { repo, clock: fakeClock(receivedAt), idGen: fakeIdGen("bundle-3"), ttlMs: 1000 }
  );

  const wellPastExpiry = new Date(new Date(expiresAt).getTime() + 1).toISOString();
  const result = await loadActiveBundle({ repo, workspaceId: "ws-1", id: bundleId, now: wellPastExpiry });
  assert.equal(result, null);
});

test("loadActiveBundle returns the record when it has not yet expired", async () => {
  const repo = new InMemoryContentTransportBundleRepo();
  const receivedAt = "2026-09-18T00:00:00.000Z";
  const { bundleId } = await stageBundle(
    { workspaceId: "ws-1", sourcePrincipalId: "principal-1", hashVersion: 1, entities: [], blobManifest: [] },
    { repo, clock: fakeClock(receivedAt), idGen: fakeIdGen("bundle-4") }
  );

  const result = await loadActiveBundle({ repo, workspaceId: "ws-1", id: bundleId, now: receivedAt });
  assert.ok(result);
  assert.equal(result?.id, bundleId);
});

test("loadActiveBundle returns null for an unknown id (never throws)", async () => {
  const repo = new InMemoryContentTransportBundleRepo();
  const result = await loadActiveBundle({ repo, workspaceId: "ws-1", id: "does-not-exist", now: "2026-09-18T00:00:00.000Z" });
  assert.equal(result, null);
});

test("computeBundleExpiry is a pure function of receivedAt + ttlMs, no hidden clock read", () => {
  const receivedAt = "2026-01-01T00:00:00.000Z";
  const expiresAt = computeBundleExpiry({ receivedAt, ttlMs: 60_000 });
  assert.equal(expiresAt, "2026-01-01T00:01:00.000Z");
});
