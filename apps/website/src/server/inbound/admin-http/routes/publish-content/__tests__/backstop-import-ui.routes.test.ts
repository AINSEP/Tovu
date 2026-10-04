import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import Database from "better-sqlite3";
import { contentKernel } from "#src/platform/db/content-kernel";
import { createRawRowSqlitePort } from "#src/platform/db/sqlite/publish-backstop-row.sqlite";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { buildGatewayDeps } from "#src/contracts/core/gated-mutations/composition";
import { InMemoryPublishContentBundleRepo, stageBundle } from "#src/features/publish-content/bundle-staging";
import { InMemoryPublishContentBaselineRepo } from "#src/features/publish-content/baseline-repo";
import { contributeRawRowPublish } from "#src/features/publish-content/raw-row-contributor";
import { CONTENT_HASH_VERSION, contentHash } from "#src/features/publish-content/content-hash";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "#src/features/publish-content/artifact-format";
import { registerPublishContentContributor, resetPublishContentContributorsForTests } from "#src/features/publish-content/type-registry";
import { registerPublishContentImportRoutes } from "../import.js";
import type { PublishContentRouteDeps } from "../deps.js";

test("real import plan returns safe before/after values for raw rows without requiring report.backstop", async (t) => {
  const db = new Database(":memory:"); t.after(() => db.close());
  db.exec("CREATE TABLE p_banner(id TEXT PRIMARY KEY, title TEXT); INSERT INTO p_banner VALUES('one','Old footer');");
  resetPublishContentContributorsForTests(); t.after(resetPublishContentContributorsForTests);
  registerPublishContentContributor(contributeRawRowPublish());
  const kernel = contentKernel(db);
  const rows = createRawRowSqlitePort({ kernel });
  const live = await rows.read({ table: "p_banner", pk: { id: "one" } }); assert.ok(live);
  const state = { ...live, values: { ...live.values, title: "New footer" } };
  const entity = { entityType: "raw-row", id: 'p_banner:{"id":"one"}', schemaVersion: 1, hashVersion: CONTENT_HASH_VERSION,
    contentHash: contentHash("raw-row", state), requiredBlobs: [], state,
    backstop: { mode: "backstop", reason: "Emergency footer fix", sourceActor: "owner", destinationHost: "live.example", gapLabels: ["table:p_banner"] } };
  const clock = { nowMs: () => Date.parse("2026-10-04T00:00:00Z") }; let serial = 0;
  const idGen = { newId: () => `id-${++serial}` };
  const bundleRepo = new InMemoryPublishContentBundleRepo();
  const staged = await stageBundle({ workspaceId: "ws", sourcePrincipalId: "owner", artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
    hashVersion: CONTENT_HASH_VERSION, entities: [entity], blobManifest: [] }, { repo: bundleRepo, clock, idGen });
  let allowValues = true;
  const authorize = async ({ permission }: { permission: string }) => ({ allowed: permission !== "publish.backstop" || allowValues, reason: "fixture permission" });
  const deps = { workspaceId: "ws", contentKernel: kernel, clock, idGen, authorize,
    publishContentBundleRepo: bundleRepo, publishContentBaselineRepo: new InMemoryPublishContentBaselineRepo(),
    gatedMutations: { gatewayDeps: buildGatewayDeps({ clock, idGen, authorize }) }, blobStore: { exists: async () => true },
  } as unknown as PublishContentRouteDeps;
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
  registerPublishContentImportRoutes(app, deps);
  const server = await startTestServer(app, t);
  const request = () => fetch(`${server}/api/admin/v1/workspaces/ws/publish-content/import/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bundleId: staged.bundleId }) });
  const response = await request(); const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.deepEqual(body.backstopPreview, [{ entityType: "raw-row", entityId: entity.id, before: live.values, after: state.values, unavailableReason: null }]);
  assert.equal(body.details.rows[0].outcome, "conflict");
  allowValues = false;
  const denied = await request(); assert.equal(denied.status, 403); assert.equal((await denied.json()).backstopPreview, undefined);
});
