import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";

import { buildGatewayDeps } from "#src/contracts/core/gated-mutations/composition";
import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "#src/features/publish-content/artifact-format";
import { InMemoryPublishContentBaselineRepo } from "#src/features/publish-content/baseline-repo";
import { InMemoryPublishContentBundleRepo, stageBundle, type StagedBundleRecord } from "#src/features/publish-content/bundle-staging";
import { CONTENT_HASH_VERSION, contentHash } from "#src/features/publish-content/content-hash";
import { contributeRawRowPublish } from "#src/features/publish-content/raw-row-contributor";
import { registerPublishContentContributor, resetPublishContentContributorsForTests } from "#src/features/publish-content/type-registry";
import { contentKernel } from "#src/platform/db/content-kernel";
import { createRawRowSqlitePort } from "#src/features/publish-content/publish-backstop-row.sqlite";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

import { registerPublishContentImportRoutes } from "../import.js";
import { BASE, recordingAuthorize, routeApp, routeDeps } from "./route-fixture.js";

/**
 * @file Pins the `import.ts` arms the ceremony suites leave to other files: the API-key refusal of
 * overwrite ticks on `plan` and `execute`, empty ticks passing for an API key, a raw-row plan
 * whose staged bundle is gone by the time the value preview reads it, the `confirm`/`execute`
 * refusals (the execute authorization pre-check and both catch arms) and an unknown run id.
 */

const API_KEY_OVERWRITE_403 = {
  error: "'overwriteEntityKeys' can only be sent from a signed-in admin session or a publishing instance",
  code: "FORBIDDEN",
  details: { permission: "publish_content.apply", reason: "credential_kind_not_permitted" },
};

for (const [step, body] of [["plan", { bundleId: "b-1" }], ["execute", { bundleId: "b-1", confirmationToken: "t-1" }]] as const) {
  test(`import/${step} refuses overwrite ticks from an API key with the exact 403`, async (t) => {
    const server = await startTestServer(routeApp(registerPublishContentImportRoutes, routeDeps()), t);
    const response = await fetch(`${server}${BASE}/import/${step}`, {
      method: "POST", headers: { "content-type": "application/json", "x-kind": "api_key" },
      body: JSON.stringify({ ...body, overwriteEntityKeys: ["post:1"] }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), API_KEY_OVERWRITE_403);
  });
}

test("import/plan lets an API key send empty ticks: the request reaches the ceremony", async (t) => {
  const server = await startTestServer(routeApp(registerPublishContentImportRoutes, routeDeps()), t);
  const response = await fetch(`${server}${BASE}/import/plan`, {
    method: "POST", headers: { "content-type": "application/json", "x-kind": "api_key" },
    body: JSON.stringify({ bundleId: "missing", overwriteEntityKeys: [] }),
  });
  // The gateway's own authorize (the composition's, which knows no principal 'owner') answers:
  // proof the request got past the overwrite gate rather than being refused by it.
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "principal 'owner' is not authorized for 'publish_content.read' (principal_disabled)", code: "NOT_AUTHORIZED" });
});

/** A bundle repo that forgets every bundle after `reads` successful reads — the staged bundle
 *  expiring between the ceremony's plan and the raw-value preview's own read. */
class ExpiringBundleRepo extends InMemoryPublishContentBundleRepo {
  constructor(private reads: number) {
    super();
  }
  override async findById(input: { workspaceId: string; id: string }): Promise<StagedBundleRecord | null> {
    if (this.reads <= 0) return null;
    this.reads--;
    return super.findById(input);
  }
}

async function rawRowPlanDeps(t: TestContext, bundleRepo: InMemoryPublishContentBundleRepo) {
  const db = new Database(":memory:"); t.after(() => db.close());
  db.exec("CREATE TABLE p_banner(id TEXT PRIMARY KEY, title TEXT); INSERT INTO p_banner VALUES('one','Old footer');");
  resetPublishContentContributorsForTests(); t.after(resetPublishContentContributorsForTests);
  registerPublishContentContributor(contributeRawRowPublish());
  const kernel = contentKernel(db);
  const live = await createRawRowSqlitePort({ kernel }).read({ table: "p_banner", pk: { id: "one" } });
  assert.ok(live);
  const state = { ...live, values: { ...live.values, title: "New footer" } };
  const entity = { entityType: "raw-row", id: 'p_banner:{"id":"one"}', schemaVersion: 1, hashVersion: CONTENT_HASH_VERSION,
    contentHash: contentHash("raw-row", state), requiredBlobs: [], state,
    backstop: { mode: "backstop", reason: "Emergency footer fix", sourceActor: "owner", destinationHost: "live.example", gapLabels: ["table:p_banner"] } };
  const clock = { nowMs: () => Date.parse("2026-10-04T00:00:00Z"), nowIso: () => "2026-10-04T00:00:00.000Z" };
  let serial = 0;
  const idGen = { newId: () => `id-${++serial}` };
  const staged = await stageBundle({ workspaceId: "ws", sourcePrincipalId: "owner", artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION,
    hashVersion: CONTENT_HASH_VERSION, entities: [entity], blobManifest: [] }, { repo: bundleRepo, clock, idGen });
  const authorize = async () => ({ allowed: true, reason: "fixture" });
  const deps = routeDeps({ contentKernel: kernel, clock, idGen, authorize, publishContentBundleRepo: bundleRepo,
    publishContentBaselineRepo: new InMemoryPublishContentBaselineRepo(), gatedMutations: { gatewayDeps: buildGatewayDeps({ clock, idGen, authorize }) } });
  return { deps, bundleId: staged.bundleId };
}

test("a raw-row plan whose staged bundle is gone by preview time answers the plan without a preview", async (t) => {
  const repo = new ExpiringBundleRepo(1);
  const { deps, bundleId } = await rawRowPlanDeps(t, repo);
  const result = await dispatchJsonRequest(routeApp(registerPublishContentImportRoutes, deps), "POST", `${BASE}/import/plan`, { bundleId });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const body = result.body as { backstopPreview?: unknown; details: { rows: Array<{ entityType: string }> } };
  assert.equal(body.backstopPreview, undefined);
  assert.deepEqual(body.details.rows.map((row) => row.entityType), ["raw-row"]);
});

/** Route deps whose gateway `authorize()` answers `allowed` for every principal and permission,
 *  with reason `fixture`, so a refusal's text is fixed by the test rather than by the composition's
 *  identity seed. */
function gatewayDecides(allowed: boolean) {
  const base = routeDeps();
  const authorize = recordingAuthorize(allowed);
  return { authorize, deps: routeDeps({ gatedMutations: { gatewayDeps: buildGatewayDeps({ clock: base.clock, idGen: base.idGen, authorize }) } }) };
}

const DENIED_APPLY = { error: "principal 'owner' is not authorized for 'publish_content.apply' (fixture)", code: "NOT_AUTHORIZED" };

test("import/confirm answers a gateway refusal through the import error mapping: the exact 403", async () => {
  const { deps } = gatewayDecides(false);
  const result = await dispatchJsonRequest(routeApp(registerPublishContentImportRoutes, deps), "POST", `${BASE}/import/confirm`, { planId: "p-1", planHash: "h-1" });
  assert.deepEqual(result, { status: 403, body: DENIED_APPLY });
});

test("import/execute refuses a principal without publish_content.apply with the exact 403 NOT_AUTHORIZED", async () => {
  const { deps } = gatewayDecides(false);
  const result = await dispatchJsonRequest(routeApp(registerPublishContentImportRoutes, deps), "POST", `${BASE}/import/execute`, { bundleId: "b-1", confirmationToken: "t-1" });
  assert.deepEqual(result, { status: 403, body: DENIED_APPLY });
});

test("import/execute's pre-check denial stops before the gateway's own execute re-authorizes", async () => {
  const { deps, authorize } = gatewayDecides(false);
  await dispatchJsonRequest(routeApp(registerPublishContentImportRoutes, deps), "POST", `${BASE}/import/execute`, { bundleId: "b-1", confirmationToken: "t-1" });
  assert.deepEqual(authorize.asked, ["publish_content.apply"]);
});

test("import/execute answers a gateway failure after the pre-check through the import error mapping", async () => {
  const { deps } = gatewayDecides(true);
  const result = await dispatchJsonRequest(routeApp(registerPublishContentImportRoutes, deps), "POST", `${BASE}/import/execute`, { bundleId: "b-1", confirmationToken: "t-1" });
  assert.deepEqual(result, { status: 409, body: { error: "confirmation token was not found", code: "TOKEN_EXPIRED" } });
});

test("GET .../runs/:runId for a run this workspace never recorded is the exact 404 RUN_NOT_FOUND", async () => {
  const result = await dispatchJsonRequest(routeApp(registerPublishContentImportRoutes, routeDeps()), "GET", `${BASE}/runs/run-1`);
  assert.deepEqual(result, { status: 404, body: { error: "publish-content run was not found", code: "RUN_NOT_FOUND" } });
});
