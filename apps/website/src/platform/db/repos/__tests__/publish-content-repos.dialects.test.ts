import assert from "node:assert/strict";
import { test } from "node:test";

import type { PublishContentPeerRecord } from "#src/features/publish-content/peers";
import type { PublishContentRunRecord } from "#src/features/publish-content/run-repo";
import type { PublishHistoryEntry } from "#src/features/deployments/static-publish/publish-history";
import type { ContentKernel } from "../../content-kernel.js";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { publishContentBaselineRepoFor } from "../publish-content-baseline-repo.js";
import { publishContentBundleRepoFor } from "../publish-content-bundle-repo.js";
import { publishContentPeerRepoFor } from "../publish-content-peer-repo.js";
import { publishContentRunRepoFor } from "../publish-content-run-repo.js";
import { publishHistoryStoreFor } from "../publish-history-repo.js";

/**
 * @file The publish-content repos (baselines, bundles, peers, runs) and the static-publish history
 * store: one Kysely body each, proven on SQLite and PGlite by the same assertions (storage plan §4).
 */

const WS = "workspace-local";
const OTHER = "workspace-other";

async function seedWorkspaces(kernel: ContentKernel): Promise<void> {
  await kernel.run((db) =>
    db
      .insertInto("workspaces")
      .values([WS, OTHER].map((id) => ({ id, name: id, slug: id, created_at: "2026-09-18T00:00:00.000Z" })))
      .execute()
  );
}

function makeAll(kernel: ContentKernel) {
  return {
    seeded: seedWorkspaces(kernel),
    baselines: publishContentBaselineRepoFor(kernel),
    bundles: publishContentBundleRepoFor(kernel),
    peers: publishContentPeerRepoFor(kernel),
    runs: publishContentRunRepoFor(kernel),
    history: publishHistoryStoreFor(kernel),
  };
}

const TABLES = [
  "workspaces",
  "publish_content_baselines",
  "publish_content_bundles",
  "publish_content_peers",
  "publish_content_runs",
  "publish_history",
];

const PEER: PublishContentPeerRecord = {
  workspaceId: WS,
  id: "peer-1",
  label: "Staging",
  baseUrl: "https://staging.example.com",
  remoteWorkspaceId: "remote-ws",
  sealed: { keyId: "k1", ciphertext: "c1", nonce: "n1", alg: "aes-256-gcm" },
  masked: "tovu_…cdef",
  aadVersion: 1,
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
};

/** A run with its JSON columns parsed: Postgres stores them as `jsonb`, which keeps the value, not the key order. */
function parsedRun(run: PublishContentRunRecord | null) {
  if (run === null) return null;
  const parse = (text: string | null) => (text === null ? null : JSON.parse(text));
  return { ...run, changeSetIdsJson: parse(run.changeSetIdsJson), reportJson: parse(run.reportJson), itemsJson: parse(run.itemsJson) };
}

const RUN: PublishContentRunRecord = {
  id: "run-1",
  workspaceId: WS,
  direction: "import",
  peerPrincipalId: "peer-1",
  peerLabel: null,
  phase: "applying",
  restorePointId: "rp-1",
  changeSetIdsJson: "[]",
  actorId: "operator-1",
  startedAt: "2026-09-19T00:00:00.000Z",
  finishedAt: null,
  reportJson: null,
  itemsJson: '[{"entityId":"post-1","phase":"pending"}]',
};

const HISTORY: PublishHistoryEntry = {
  target: "vercel",
  url: "https://site.vercel.app",
  reachable: true,
  status: "READY",
  projectName: "site",
  publishedAt: "2026-09-19T00:00:00.000Z",
  deploymentId: "dpl_1",
  triggeredBy: "admin_ui",
};

describeEachDialect("publish-content repos", { tables: TABLES, make: makeAll }, (make) => {
  test("baselines: absent is null; upsert inserts then replaces on the 4-column key", async () => {
    const { seeded, baselines } = make();
    await seeded;
    const key = { workspaceId: WS, peerPrincipalId: "p", entityType: "post", entityId: "e1" };
    assert.equal(await baselines.findOne(key), null);
    const first = { ...key, hashAtLastSync: "h1", hashVersion: 1, syncedAt: "2026-09-19T00:00:00.000Z", runId: "r1" };
    await baselines.upsert(first);
    assert.deepEqual(await baselines.findOne(key), first);
    const second = { ...first, hashAtLastSync: "h2", hashVersion: 2, runId: "r2" };
    await baselines.upsert(second);
    assert.deepEqual(await baselines.findOne(key), second);
    assert.equal(await baselines.findOne({ ...key, workspaceId: OTHER }), null);
  });

  test("bundles: save, scoped findById, deleteExpired is strict and counts", async () => {
    const { seeded, bundles } = make();
    await seeded;
    const base = {
      workspaceId: WS,
      sourcePrincipalId: "principal",
      artifactFormatVersion: 1,
      hashVersion: 1,
      entitiesJson: "[]",
      blobManifestJson: "[]",
      sizeBytes: 10,
      receivedAt: "2026-09-18T00:00:00.000Z",
    };
    await bundles.save({ ...base, id: "old", expiresAt: "2026-09-18T00:00:01.000Z" });
    await bundles.save({ ...base, id: "edge", expiresAt: "2026-09-18T00:00:02.000Z" });
    assert.deepEqual(await bundles.findById({ workspaceId: WS, id: "old" }), {
      ...base,
      id: "old",
      expiresAt: "2026-09-18T00:00:01.000Z",
    });
    assert.equal(await bundles.findById({ workspaceId: OTHER, id: "old" }), null);
    assert.equal(await bundles.deleteExpired({ expiredBefore: "2026-09-18T00:00:02.000Z" }), 1);
    assert.equal(await bundles.findById({ workspaceId: WS, id: "old" }), null);
    assert.ok(await bundles.findById({ workspaceId: WS, id: "edge" }));
  });

  test("peers: sealed group round-trips, update replaces, list scoped, delete idempotent", async () => {
    const { seeded, peers } = make();
    await seeded;
    await peers.insert(PEER);
    await peers.insert({ ...PEER, id: "peer-2", label: "Bare", sealed: null, masked: null });
    assert.deepEqual(await peers.findById({ workspaceId: WS, id: "peer-1" }), PEER);
    assert.equal((await peers.findById({ workspaceId: WS, id: "peer-2" }))?.sealed, null);
    await peers.update({ ...PEER, label: "Renamed", updatedAt: "2026-09-19T00:00:00.000Z" });
    assert.equal((await peers.findById({ workspaceId: WS, id: "peer-1" }))?.label, "Renamed");
    assert.deepEqual((await peers.listByWorkspace({ workspaceId: WS })).map((p) => p.id).sort(), ["peer-1", "peer-2"]);
    assert.deepEqual(await peers.listByWorkspace({ workspaceId: OTHER }), []);
    await peers.delete({ workspaceId: WS, id: "peer-1" });
    await peers.delete({ workspaceId: WS, id: "peer-1" });
    assert.equal(await peers.findById({ workspaceId: WS, id: "peer-1" }), null);
  });

  test("peers: the (workspace_id, label) UNIQUE index rejects a duplicate label", async () => {
    const { seeded, peers } = make();
    await seeded;
    await peers.insert(PEER);
    await assert.rejects(peers.insert({ ...PEER, id: "peer-dup" }));
  });

  test("runs: save inserts, a second save updates only the progress columns, scoped read", async () => {
    const { seeded, runs } = make();
    await seeded;
    await runs.save(RUN);
    assert.deepEqual(parsedRun(await runs.findById({ workspaceId: WS, id: "run-1" })), parsedRun(RUN));
    const done = {
      ...RUN,
      actorId: "someone-else",
      phase: "failed" as const,
      changeSetIdsJson: '["cs-1"]',
      finishedAt: "2026-09-19T00:00:01.000Z",
      reportJson: '{"refused":false}',
    };
    await runs.save(done);
    assert.deepEqual(parsedRun(await runs.findById({ workspaceId: WS, id: "run-1" })), parsedRun({ ...done, actorId: RUN.actorId }));
    assert.equal(await runs.findById({ workspaceId: OTHER, id: "run-1" }), null);
  });

  test("history: newest first, target filter, limit, optional fields omitted, boolean reachable", async () => {
    const { seeded, history } = make();
    await seeded;
    assert.equal(await history.getLast({ workspaceId: WS, target: "vercel" }), null);
    await history.recordSuccess({ workspaceId: WS, entry: HISTORY });
    await history.recordSuccess({ workspaceId: WS, entry: { ...HISTORY, target: "netlify", reachable: false } });
    await history.recordSuccess({ workspaceId: WS, entry: { ...HISTORY, url: "https://v2.vercel.app" } });
    await history.recordSuccess({ workspaceId: OTHER, entry: HISTORY });
    assert.deepEqual(await history.getLast({ workspaceId: WS, target: "vercel" }), { ...HISTORY, url: "https://v2.vercel.app" });
    const all = await history.list({ workspaceId: WS });
    assert.deepEqual(all.map((e) => [e.target, e.url, e.reachable]), [
      ["vercel", "https://v2.vercel.app", true],
      ["netlify", HISTORY.url, false],
      ["vercel", HISTORY.url, true],
    ]);
    assert.equal("owner" in all[0]!, false);
    assert.deepEqual((await history.list({ workspaceId: WS, target: "vercel", limit: 1 })).map((e) => e.url), ["https://v2.vercel.app"]);
  });
});
