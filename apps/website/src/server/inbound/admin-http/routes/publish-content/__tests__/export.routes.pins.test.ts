import assert from "node:assert/strict";
import test from "node:test";

import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "#src/features/publish-content/artifact-format";
import { CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { PublishTrustContext } from "#src/server/inbound/admin-http/publish-trust-auth";

import { registerPublishContentExportRoute } from "../export.js";
import { BASE, WS, routeApp, routeDeps } from "./route-fixture.js";

/**
 * @file Pins the `export.ts` arms the export suites do not reach directly: a workspace row that
 * cannot be found labels the bundle with the raw workspace id rather than failing or sending
 * `null`, a missing principal answers the fixed 500 before any byte is streamed, and a publishing
 * credential is refused outright rather than handed an empty bundle.
 */

test("GET .../export labels the bundle with the workspace id when the workspace row is missing", async () => {
  // The composition's in-memory repo seeds a different workspace id, so `ws` has no row.
  const result = await dispatchJsonRequest(routeApp(registerPublishContentExportRoute, routeDeps()), "GET", `${BASE}/export`);
  assert.equal(result.status, 200);
  const body = result.body as Record<string, unknown>;
  assert.deepEqual(
    { artifactFormatVersion: body.artifactFormatVersion, hashVersion: body.hashVersion, sourceLabel: body.sourceLabel },
    { artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: CONTENT_HASH_VERSION, sourceLabel: WS }
  );
});

test("GET .../export with no principal (requireAdminSession did not run) is the fixed 500 before any byte is streamed", async (t) => {
  const server = await startTestServer(routeApp(registerPublishContentExportRoute, routeDeps()), t);
  const response = await fetch(`${server}${BASE}/export`, { headers: { "x-principal": "none" } });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "internal error" });
});

/** A publishing grant that holds `publish_content.read`, the permission the route-level gate asks for. */
const READ_GRANT: PublishTrustContext = {
  sourceInstallationId: "source-install", generation: 1, capabilities: ["publish_content.read"], entityTypes: ["post"],
};

test("GET .../export from a publishing credential is the exact 403, never an empty bundle", async () => {
  const app = routeApp(registerPublishContentExportRoute, routeDeps(), { publishTrust: READ_GRANT });
  assert.deepEqual(await dispatchJsonRequest(app, "GET", `${BASE}/export`), {
    status: 403,
    body: {
      error: "a publishing credential cannot export from this site",
      code: "FORBIDDEN",
      details: { permission: "publish_content.read", reason: "publish_trust_export_not_wired" },
    },
  });
});
