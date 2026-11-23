/**
 * @file Characterization of which principal the import plan reads the sync baseline under
 * (publish-engine D10e).
 *
 * The baseline is keyed by the peer that pushed the bundle, so the plan step must look it up under
 * the staged bundle's OWN source principal, never the admin who is confirming the import. A wrong
 * key makes every row of a second publish look like a first publish (no baseline, so a destination
 * that differs from the incoming content is a conflict), or reads another peer's baseline.
 *
 * Both cases drive the real plan step through `gateway.plan()`. The destination row is unchanged
 * since the last sync (its hash equals the baseline hash) and the incoming content differs, so a
 * correct baseline lookup yields a row that writes, and a missing baseline yields a conflict.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "@jini-ai/cms/publish/transfer";
import { InMemoryPublishContentBaselineRepo } from "@jini-ai/cms/publish/content/baseline-repo";
import { InMemoryPublishContentBundleRepo } from "@jini-ai/cms/publish/transfer";
import { CONTENT_HASH_VERSION, contentHash } from "@jini-ai/cms/publish/content/content-hash";
import { buildPublishContentImportHooks } from "../gated-hooks.js";
import type { PublishContentReport } from "../plan-rows.js";
import { InMemoryPostRepo } from "../../post/repo.memory.js";
import {
  registerPublishContentContributor,
  resetPublishContentContributorsForTests,
  type PublishContentHandler,
} from "../type-registry.js";
import { InMemoryTokenStore } from "../../../contracts/core/gated-mutations/token.js";
import { plan } from "../../../contracts/core/gated-mutations/gateway.js";

const WORKSPACE_ID = "ws-1";
const BUNDLE_ID = "bundle-1";
const ADMIN_ID = "admin-1";
const SOURCE_PEER_ID = "source-peer-1";
const OTHER_PEER_ID = "other-peer-1";
const ENTITY_TYPE = "thing";
const ENTITY_ID = "thing-1";
const INCOMING_HASH = contentHash({ entityType: ENTITY_TYPE, state: { title: "incoming" } });
const SYNCED_HASH = contentHash({ entityType: ENTITY_TYPE, state: { title: "synced" } });

test.beforeEach(() => {
  resetPublishContentContributorsForTests();
});

/** Plans the staged bundle with a baseline saved under `baselinePeer` and returns the single row. */
async function planRowWithBaselineUnder({ baselinePeer }: { baselinePeer: string }) {
  const handler: PublishContentHandler = {
    entityType: ENTITY_TYPE, schemaVersion: 1, permission: "content.write", dependsOn: [],
    pack: async function* () {},
    // Unchanged since the last sync: its hash is the one the baseline recorded.
    inspect: async () => ({ version: 1, hash: SYNCED_HASH }),
    precheck: async () => null,
    apply: async () => { throw new Error("planning must never apply"); },
  };
  registerPublishContentContributor({ contributor: { entityType: ENTITY_TYPE, dependsOn: [], build: () => handler } });

  const bundleRepo = new InMemoryPublishContentBundleRepo();
  await bundleRepo.save({ record: {
    id: BUNDLE_ID, workspaceId: WORKSPACE_ID, sourcePrincipalId: SOURCE_PEER_ID,
    artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: CONTENT_HASH_VERSION,
    entitiesJson: JSON.stringify([{
      entityType: ENTITY_TYPE, id: ENTITY_ID, schemaVersion: 1, contentHash: INCOMING_HASH,
      hashVersion: CONTENT_HASH_VERSION, requiredBlobs: [], state: { title: "incoming" },
    }]),
    blobManifestJson: JSON.stringify([]), sizeBytes: 64,
    receivedAt: "2026-09-20T00:00:00.000Z", expiresAt: "2026-09-21T00:00:00.000Z",
  } });
  const baselineRepo = new InMemoryPublishContentBaselineRepo();
  await baselineRepo.upsert({ record: {
    workspaceId: WORKSPACE_ID, peerPrincipalId: baselinePeer, entityType: ENTITY_TYPE, entityId: ENTITY_ID,
    hashAtLastSync: SYNCED_HASH, hashVersion: CONTENT_HASH_VERSION, syncedAt: "2026-09-19T00:00:00.000Z", runId: "run-0",
  } });

  let nextId = 0;
  const idGen = { newId: () => `id-${++nextId}` };
  const clock = { nowMs: () => Date.parse("2026-09-20T12:00:00.000Z") };
  const hooks = buildPublishContentImportHooks({
    workspaceId: WORKSPACE_ID, bundleId: BUNDLE_ID, actorId: ADMIN_ID, clock, idGen,
    publishContentDeps: { workspaceId: WORKSPACE_ID, clock, idGen, ports: { post: { repo: new InMemoryPostRepo({}) } } },
    bundleRepo, baselineRepo, blobStore: { exists: async () => true },
    dbOps: { captureRestorePoint: async () => ({ artifactRef: "artifact-1", watermarkAtCapture: 1 }) },
    restorePointsRepo: { save: async () => {} },
    applyPort: { applyReport: async () => { throw new Error("planning must never apply"); } },
  });
  const planned = await plan({
    deps: { clock, idGen, authorize: async () => ({ allowed: true, reason: "ok" }), tokens: new InMemoryTokenStore() },
    principalId: ADMIN_ID, principalKind: "user", hooks,
  });
  return (planned.details as PublishContentReport).rows[0];
}

test("the plan reads the baseline saved under the bundle's source principal: an unchanged destination writes", async () => {
  const row = await planRowWithBaselineUnder({ baselinePeer: SOURCE_PEER_ID });
  assert.equal(row?.writes, true);
  assert.notEqual(row?.outcome, "conflict");
});

test("a baseline saved under the confirming admin or another peer is not read: the row is a conflict", async () => {
  for (const baselinePeer of [ADMIN_ID, OTHER_PEER_ID]) {
    resetPublishContentContributorsForTests();
    const row = await planRowWithBaselineUnder({ baselinePeer });
    assert.equal(row?.outcome, "conflict", `baseline under ${baselinePeer}`);
    assert.equal(row?.writes, false, `baseline under ${baselinePeer}`);
  }
});
