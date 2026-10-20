import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";

import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "#src/features/publish-content/artifact-format";
import { InMemoryPublishContentBundleRepo, type StagedBundleRecord } from "#src/features/publish-content/bundle-staging";
import { CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import { contentKernel } from "#src/platform/db/content-kernel";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { PublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";

import { registerPublishContentBundleCreateRoute, validateBundleBody } from "../bundle-create.js";
import { BASE, routeApp, routeDeps } from "./route-fixture.js";

/**
 * @file Pins every `bundle-create.ts` arm the bundles/validation/trust-gate suites leave open:
 * each envelope refusal in check order, the manual-send (backstop) gate for a publishing
 * credential, the destination-host and audit-storage checks, a missing principal and a failing
 * stage.
 */

const BUNDLES = `${BASE}/bundles`;

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: CONTENT_HASH_VERSION, sourceLabel: "source", entities: [], blobManifest: [], ...overrides };
}

const ENVELOPE_REFUSALS: ReadonlyArray<[string, unknown, string]> = [
  ["absent body", undefined, "artifactFormatVersion must be an integer"],
  ["null body", null, "artifactFormatVersion must be an integer"],
  ["hashVersion not an integer", envelope({ hashVersion: "1" }), "hashVersion must be an integer"],
  ["entities not an array", envelope({ entities: {} }), "entities must be an array"],
  ["entity null", envelope({ entities: [null] }), "entities[0] must be an object"],
  ["entity an array", envelope({ entities: [[]] }), "entities[0] must be an object"],
  ["entity a string", envelope({ entities: ["post"] }), "entities[0] must be an object"],
  ["entityType missing", envelope({ entities: [{ schemaVersion: 1 }] }), "entities[0].entityType must be a non-empty string"],
  ["entityType empty", envelope({ entities: [{ entityType: "", schemaVersion: 1 }] }), "entities[0].entityType must be a non-empty string"],
  ["second entity bad", envelope({ entities: [{ entityType: "post", schemaVersion: 1 }, { entityType: "post" }] }), "entities[1].schemaVersion must be an integer"],
  ["blobManifest absent", envelope({ blobManifest: undefined }), "blobManifest must be an array of strings"],
  ["blobManifest with a number", envelope({ blobManifest: ["a", 1] }), "blobManifest must be an array of strings"],
  ["sourceLabel a number", envelope({ sourceLabel: 7 }), "sourceLabel must be a string when present"],
  ["entities checked before blobManifest", envelope({ entities: [null], blobManifest: 1 }), "entities[0] must be an object"],
];

for (const [name, body, error] of ENVELOPE_REFUSALS) {
  test(`validateBundleBody refuses ${name}: ${error}`, () => {
    assert.deepEqual(validateBundleBody(body), { error });
  });
}

test("validateBundleBody accepts an absent sourceLabel", () => {
  assert.deepEqual(validateBundleBody(envelope({ sourceLabel: undefined })), {
    artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: CONTENT_HASH_VERSION, sourceLabel: undefined, entities: [], blobManifest: [],
  });
});

test("POST .../bundles answers an envelope refusal as 400 with its message", async () => {
  const app = routeApp(registerPublishContentBundleCreateRoute, routeDeps());
  assert.deepEqual(await dispatchJsonRequest(app, "POST", BUNDLES, envelope({ sourceLabel: 7 })), { status: 400, body: { error: "sourceLabel must be a string when present" } });
});

test("POST .../bundles with no principal (requireAdminSession did not run) is the fixed 500", async (t) => {
  const server = await startTestServer(routeApp(registerPublishContentBundleCreateRoute, routeDeps()), t);
  const response = await fetch(`${server}${BUNDLES}`, { method: "POST", headers: { "content-type": "application/json", "x-principal": "none" }, body: JSON.stringify(envelope()) });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "internal error" });
});

/** A bundle repo whose save fails, as a full disk would. */
class FailingBundleRepo extends InMemoryPublishContentBundleRepo {
  override async save(_record: StagedBundleRecord): Promise<void> {
    throw new Error("SQLITE_FULL");
  }
}

test("POST .../bundles answers a failing stage with the fixed 500, never the store's message", async () => {
  const app = routeApp(registerPublishContentBundleCreateRoute, routeDeps({ publishContentBundleRepo: new FailingBundleRepo() }));
  assert.deepEqual(await dispatchJsonRequest(app, "POST", BUNDLES, envelope()), { status: 500, body: { error: "internal error" } });
});

test("POST .../bundles stages an empty bundle for a human session and answers 201", async () => {
  const app = routeApp(registerPublishContentBundleCreateRoute, routeDeps({ publishContentBundleRepo: new InMemoryPublishContentBundleRepo() }));
  const result = await dispatchJsonRequest(app, "POST", BUNDLES, envelope());
  assert.equal(result.status, 201);
  assert.deepEqual(Object.keys(result.body as object).sort(), ["bundleId", "expiresAt"]);
});

const BACKSTOP_GRANT: PublishTrustContext = {
  sourceInstallationId: "source-install", generation: 1,
  capabilities: ["publish_content.apply", "publish_content.backstop"], entityTypes: ["raw-row"],
};

function rawRow(id: string, destinationHost = "localhost"): Record<string, unknown> {
  return {
    entityType: "raw-row", id: `p_banner:{"id":"${id}"}`, schemaVersion: 1, hashVersion: CONTENT_HASH_VERSION, contentHash: "hash", requiredBlobs: [],
    state: { table: "p_banner", pk: { id }, values: { id, title: "New footer" } },
    backstop: { mode: "backstop", reason: "Emergency footer fix", sourceActor: "owner", destinationHost, gapLabels: [] },
  };
}

const BACKSTOP_NOT_GRANTED = {
  error: "Send by hand requires the destination's backstop grant and raw entity type.",
  code: "FORBIDDEN", details: { permission: "publish_content.backstop", reason: "backstop_not_granted" },
};

test("a human session cannot send a raw row: the backstop gate needs a publishing grant", async () => {
  const app = routeApp(registerPublishContentBundleCreateRoute, routeDeps());
  assert.deepEqual(await dispatchJsonRequest(app, "POST", BUNDLES, envelope({ entities: [rawRow("one")] })), { status: 403, body: BACKSTOP_NOT_GRANTED });
});

test("a publishing grant without the backstop capability cannot send a raw row", async () => {
  const app = routeApp(registerPublishContentBundleCreateRoute, routeDeps(), { publishTrust: { ...BACKSTOP_GRANT, capabilities: ["publish_content.apply"] } });
  assert.deepEqual(await dispatchJsonRequest(app, "POST", BUNDLES, envelope({ entities: [rawRow("one")] })), { status: 403, body: BACKSTOP_NOT_GRANTED });
});

test("a publishing grant refuses the whole bundle when one entity type is outside its allowlist", async () => {
  const app = routeApp(registerPublishContentBundleCreateRoute, routeDeps(), { publishTrust: BACKSTOP_GRANT });
  const result = await dispatchJsonRequest(app, "POST", BUNDLES, envelope({ entities: [rawRow("one"), { entityType: "widget", id: "w", schemaVersion: 1 }] }));
  assert.deepEqual(result, {
    status: 403,
    body: { error: "this bundle carries an entity type outside the publishing grant", code: "FORBIDDEN", details: { permission: "publish_content.apply", reason: "entity_type_not_granted" } },
  });
});

test("a manual send with invalid send details is a 400 naming the problem", async () => {
  const app = routeApp(registerPublishContentBundleCreateRoute, routeDeps(), { publishTrust: BACKSTOP_GRANT });
  assert.deepEqual(await dispatchJsonRequest(app, "POST", BUNDLES, envelope({ entities: [rawRow("one"), rawRow("one")] })), { status: 400, body: { error: "Choose each item once." } });
});

test("a manual send confirmed for another address is a 400 before audit storage is consulted", async () => {
  const app = routeApp(registerPublishContentBundleCreateRoute, routeDeps(), { publishTrust: BACKSTOP_GRANT });
  assert.deepEqual(await dispatchJsonRequest(app, "POST", BUNDLES, envelope({ entities: [rawRow("one", "live.example")] })), {
    status: 400, body: { error: "The confirmed live address does not match this destination." },
  });
});

test("a manual send to a destination with no audit storage is the 503 BACKSTOP_NOT_INSTALLED", async () => {
  const app = routeApp(registerPublishContentBundleCreateRoute, routeDeps(), { publishTrust: BACKSTOP_GRANT });
  assert.deepEqual(await dispatchJsonRequest(app, "POST", BUNDLES, envelope({ entities: [rawRow("one")] })), {
    status: 503, body: { error: "Send by hand needs its audit storage installed before it can send anything.", code: "BACKSTOP_NOT_INSTALLED" },
  });
});

function sqliteKernel(t: TestContext, withAuditTable: boolean) {
  const db = new Database(":memory:"); t.after(() => db.close());
  // Test-only schema; no active migration is created or installed.
  if (withAuditTable) db.exec("CREATE TABLE publish_backstop_log (id TEXT PRIMARY KEY)");
  return contentKernel(db);
}

test("a manual send whose audit table is not installed yet is the 503 BACKSTOP_NOT_INSTALLED", async (t) => {
  const app = routeApp(registerPublishContentBundleCreateRoute, routeDeps({ contentKernel: sqliteKernel(t, false) }), { publishTrust: BACKSTOP_GRANT });
  assert.equal((await dispatchJsonRequest(app, "POST", BUNDLES, envelope({ entities: [rawRow("one")] }))).status, 503);
});

test("a manual send with installed audit storage, the right address and a backstop grant is staged", async (t) => {
  const app = routeApp(registerPublishContentBundleCreateRoute, routeDeps({ contentKernel: sqliteKernel(t, true), publishContentBundleRepo: new InMemoryPublishContentBundleRepo() }), { publishTrust: BACKSTOP_GRANT });
  const result = await dispatchJsonRequest(app, "POST", BUNDLES, envelope({ entities: [rawRow("one")] }));
  assert.equal(result.status, 201, JSON.stringify(result.body));
});
