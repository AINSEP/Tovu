import assert from "node:assert/strict";
import test from "node:test";

import { PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION } from "#src/features/publish-content/artifact-format";
import { CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import { PublishContentPeerTransportError } from "#src/features/publish-content/peer-transport";
import {
  InMemoryPublishContentPeerRepo,
  PublishContentPeerCredentialMissingError,
  PublishContentPeerNotFoundError,
  PublishContentPeerSecretStoreUnconfiguredError,
  PublishContentPeerValidationError,
} from "#src/features/publish-content/peers";
import { PublishTrustHandshakeError } from "#src/features/publish-trust/handshake-client";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import type { HttpClientPort } from "#src/platform/http/index";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

import { registerPublishContentPeerTransportRoutes } from "../peer-transport.js";
import { registerPublishContentPeerRoutes } from "../peers.js";
import { BASE, FailingPeerRepo, recordingAuthorize, routeApp, routeDeps } from "./route-fixture.js";

/**
 * @file Pins every branch of `peer-transport.ts` the scope/live-site/peers suites do not already
 * reach: each typed error's HTTP arm on every route, the generic 500, the api-key refusal of
 * overwrite ticks on both routes that take them, and a bodyless request.
 */

const PEER = `${BASE}/peers/peer-1`;
const SEND_BODIES: Record<string, Record<string, unknown>> = {
  "push/plan": {},
  "push/confirm": { planId: "plan-1", planHash: "hash-1" },
  "push/execute": { bundleId: "bundle-1", confirmationToken: "token-1" },
  pull: {},
};

const TYPED_ERRORS: ReadonlyArray<[Error, number, string]> = [
  [new PublishContentPeerNotFoundError("peer 'peer-1' was not found"), 404, "PEER_NOT_FOUND"],
  [new PublishTrustHandshakeError("live.example does not accept publishes from this computer yet", "not-connected"), 502, "PUBLISH_TRUST_HANDSHAKE_FAILED"],
  [new PublishContentPeerCredentialMissingError("peer 'peer-1' has no saved credential"), 409, "PEER_CREDENTIAL_MISSING"],
  [new PublishContentPeerSecretStoreUnconfiguredError("peer 'Live' credential could not be opened"), 503, "SECRET_STORE_UNCONFIGURED"],
  [new PublishContentPeerTransportError("peer answered 401", "PEER_REJECTED", { peerStatus: 401 }), 502, "PEER_REJECTED"],
];

for (const [route, body] of Object.entries(SEND_BODIES)) {
  for (const [error, status, code] of TYPED_ERRORS) {
    test(`${route} maps ${error.name} to ${status} ${code} with its own message`, async () => {
      const app = routeApp(registerPublishContentPeerTransportRoutes, routeDeps({ publishContentPeerRepo: new FailingPeerRepo(error) }));
      assert.deepEqual(await dispatchJsonRequest(app, "POST", `${PEER}/${route}`, body), { status, body: { error: error.message, code } });
    });
  }

  test(`${route} answers an untyped or unmapped error with the fixed 500`, async () => {
    for (const error of [new Error("ECONNRESET 10.0.0.5"), new PublishContentPeerValidationError("label is required")]) {
      const app = routeApp(registerPublishContentPeerTransportRoutes, routeDeps({ publishContentPeerRepo: new FailingPeerRepo(error) }));
      assert.deepEqual(await dispatchJsonRequest(app, "POST", `${PEER}/${route}`, body), { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } });
    }
  });

  test(`${route} asks only publish_content.apply, and a denial is the standard 403`, async () => {
    const authorize = recordingAuthorize(false);
    const app = routeApp(registerPublishContentPeerTransportRoutes, routeDeps({ authorize }));
    const result = await dispatchJsonRequest(app, "POST", `${PEER}/${route}`, body);
    assert.deepEqual(result, {
      status: 403,
      body: { error: "principal 'owner' is not authorized for 'publish_content.apply' (fixture)", code: "FORBIDDEN", details: { permission: "publish_content.apply", reason: "fixture" } },
    });
    assert.deepEqual(authorize.asked, ["publish_content.apply"]);
  });
}

for (const route of ["push/plan", "push/execute"]) {
  test(`${route} refuses overwrite ticks from an API key with the exact 403, before opening the peer`, async (t) => {
    const app = routeApp(registerPublishContentPeerTransportRoutes, routeDeps({ publishContentPeerRepo: new FailingPeerRepo(new Error("must not open the peer")) }));
    const server = await startTestServer(app, t);
    const response = await fetch(`${server}${PEER}/${route}`, {
      method: "POST", headers: { "content-type": "application/json", "x-kind": "api_key" },
      body: JSON.stringify({ ...SEND_BODIES[route], overwriteEntityKeys: ["post:1"] }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "'overwriteEntityKeys' can only be sent from a signed-in admin session",
      code: "FORBIDDEN",
      details: { permission: "publish_content.apply", reason: "credential_kind_not_permitted" },
    });
  });
}

test("push/confirm with no parsed body is the exact 400 before the peer is opened", async () => {
  const app = routeApp(registerPublishContentPeerTransportRoutes, routeDeps({ publishContentPeerRepo: new FailingPeerRepo(new Error("must not open the peer")) }), { json: false });
  assert.deepEqual(await dispatchJsonRequest(app, "POST", `${PEER}/push/confirm`), {
    status: 400, body: { error: "'planId' and 'planHash' (strings) are required", code: "VALIDATION_ERROR" },
  });
});

test("push/execute with no parsed body is the exact 400 before the peer is opened", async () => {
  const app = routeApp(registerPublishContentPeerTransportRoutes, routeDeps({ publishContentPeerRepo: new FailingPeerRepo(new Error("must not open the peer")) }), { json: false });
  assert.deepEqual(await dispatchJsonRequest(app, "POST", `${PEER}/push/execute`), {
    status: 400, body: { error: "'bundleId' and 'confirmationToken' (strings) are required", code: "VALIDATION_ERROR" },
  });
});

test("push/plan with no parsed body plans everything and opens the peer", async () => {
  const app = routeApp(registerPublishContentPeerTransportRoutes, routeDeps({ publishContentPeerRepo: new FailingPeerRepo(new PublishContentPeerNotFoundError("peer 'peer-1' was not found")) }), { json: false });
  assert.deepEqual(await dispatchJsonRequest(app, "POST", `${PEER}/push/plan`), {
    status: 404, body: { error: "peer 'peer-1' was not found", code: "PEER_NOT_FOUND" },
  });
});

/** Deps with a real sealed peer `peer-1` and `send` as the peer's HTTP side. */
async function sealedPeerApp(send: HttpClientPort["send"]) {
  const keyring = new InMemoryKeyring();
  let ids = 0;
  const deps = routeDeps({
    publishContentPeerRepo: new InMemoryPublishContentPeerRepo(),
    siteAssistantSecretSealer: new AesGcmSecretSealer(keyring),
    siteAssistantSecretKeyring: keyring,
    publishContentPeerHttpClient: { send },
    idGen: { newId: () => `peer-${++ids}` },
  });
  const created = await dispatchJsonRequest(routeApp(registerPublishContentPeerRoutes, deps), "POST", `${BASE}/peers`, {
    label: "Live", baseUrl: "https://live.example", remoteWorkspaceId: "remote", apiKey: "tovu_live_0123456789abcdef",
  });
  assert.equal(created.status, 201);
  return routeApp(registerPublishContentPeerTransportRoutes, deps);
}

test("push/execute with no overwrite ticks relays a body without overwriteEntityKeys and answers the peer's result", async () => {
  const sent: unknown[] = [];
  const app = await sealedPeerApp(async (request) => {
    sent.push(JSON.parse(String(request.body)));
    return { status: 200, headers: {}, bodyText: JSON.stringify({ restorePointId: "rp-1", runId: "run-1", changeSetIds: [] }) };
  });
  const result = await dispatchJsonRequest(app, "POST", `${PEER}/push/execute`, { bundleId: "bundle-1", confirmationToken: "token-1" });
  assert.equal(result.status, 200);
  assert.deepEqual(sent, [{ bundleId: "bundle-1", confirmationToken: "token-1" }]);
});

test("pull stages the peer's export here and answers 201 with the local bundle", async () => {
  const app = await sealedPeerApp(async () => ({
    status: 200, headers: {}, bodyText: JSON.stringify({
      artifactFormatVersion: PUBLISH_CONTENT_ARTIFACT_FORMAT_VERSION, hashVersion: CONTENT_HASH_VERSION, sourceLabel: "Live", entities: [], blobManifest: [],
    }),
  }));
  const result = await dispatchJsonRequest(app, "POST", `${PEER}/pull`, {});
  assert.equal(result.status, 201);
  assert.equal(typeof (result.body as { bundleId: unknown }).bundleId, "string");
});
