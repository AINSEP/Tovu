import { assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryPublishContentPeerRepo,
  PublishContentPeerCredentialMissingError,
  PublishContentPeerDuplicateLabelError,
  PublishContentPeerNotFoundError,
  PublishContentPeerSecretStoreUnconfiguredError,
  PublishContentPeerValidationError,
} from "#src/features/publish-content/peers";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

import { registerPublishContentPeerRoutes } from "../peers.js";
import { BASE, FailingPeerRepo, routeApp, routeDeps } from "./route-fixture.js";

/**
 * @file Pins every branch of `peers.ts` that `peers.routes.test.ts` does not already reach: the
 * error-to-HTTP arm for each typed store error, the generic 500 for an untyped one, a missing
 * principal, a bodyless write, and PATCH forwarding only the keys the body carries.
 */

const PEERS = `${BASE}/peers`;

const TYPED_ERRORS: ReadonlyArray<[Error, number, string]> = [
  [new PublishContentPeerValidationError("label is required"), 400, "VALIDATION_ERROR"],
  [new PublishContentPeerDuplicateLabelError("a peer labelled 'Live' already exists"), 409, "DUPLICATE_LABEL"],
  [new PublishContentPeerNotFoundError("peer 'p' was not found"), 404, "PEER_NOT_FOUND"],
  [new PublishContentPeerSecretStoreUnconfiguredError("publish-content peer secret store is unconfigured"), 503, "SECRET_STORE_UNCONFIGURED"],
];

for (const [error, status, code] of TYPED_ERRORS) {
  test(`GET .../peers maps ${error.name} to ${status} ${code} with its own message`, async () => {
    const app = routeApp(registerPublishContentPeerRoutes, routeDeps({ publishContentPeerRepo: new FailingPeerRepo(error) }));
    assert.deepEqual(await dispatchJsonRequest(app, "GET", PEERS), { status, body: { error: error.message, code } });
  });
}

test("GET .../peers answers an untyped failure with a fixed 500 that never echoes its message", async () => {
  const app = routeApp(registerPublishContentPeerRoutes, routeDeps({ publishContentPeerRepo: new FailingPeerRepo(new Error("SQLITE_BUSY at /secret/path")) }));
  assertAdminResponse({ actual: await dispatchJsonRequest(app, "GET", PEERS), expected: { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } } }, { failure: {"message":"The publishing destinations could not be loaded.","action":"Try loading them again. If it still fails, copy details and report this problem.","step":"Load publishing destinations"} });
});

test("a typed error this route does not map (credential missing) is still the fixed 500", async () => {
  const app = routeApp(registerPublishContentPeerRoutes, routeDeps({ publishContentPeerRepo: new FailingPeerRepo(new PublishContentPeerCredentialMissingError("peer has no credential")) }));
  assertAdminResponse({ actual: await dispatchJsonRequest(app, "GET", PEERS), expected: { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } } }, { failure: {"message":"The publishing destinations could not be loaded.","action":"Try loading them again. If it still fails, copy details and report this problem.","step":"Load publishing destinations"} });
});

test("GET .../peers lists the saved peers", async () => {
  const app = routeApp(registerPublishContentPeerRoutes, routeDeps({ publishContentPeerRepo: new InMemoryPublishContentPeerRepo() }));
  assert.deepEqual(await dispatchJsonRequest(app, "GET", PEERS), { status: 200, body: { peers: [] } });
});

test("PATCH .../peers/:peerId answers a store failure through the same mapping", async () => {
  const app = routeApp(registerPublishContentPeerRoutes, routeDeps({ publishContentPeerRepo: new FailingPeerRepo(new PublishContentPeerNotFoundError("peer 'p' was not found")) }));
  assert.deepEqual(await dispatchJsonRequest(app, "PATCH", `${PEERS}/p`, { label: "Renamed" }), { status: 404, body: { error: "peer 'p' was not found", code: "PEER_NOT_FOUND" } });
});

test("DELETE .../peers/:peerId answers a store failure through the same mapping", async () => {
  const app = routeApp(registerPublishContentPeerRoutes, routeDeps({ publishContentPeerRepo: new FailingPeerRepo(new Error("disk full")) }));
  assertAdminResponse({ actual: await dispatchJsonRequest(app, "DELETE", `${PEERS}/p`), expected: { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } } }, { failure: {"message":"The publishing destination removal could not be confirmed.","action":"Check the list before repeating the removal. Copy details and report this problem.","step":"Remove publishing destination"} });
});

test("a missing principal (requireAdminSession did not run) is the fixed 500 on every peers route", async (t) => {
  const app = routeApp(registerPublishContentPeerRoutes, routeDeps({ publishContentPeerRepo: new InMemoryPublishContentPeerRepo() }));
  const server = await startTestServer(app, t);
  for (const [method, path, failure] of [
    ["GET", PEERS, {"message":"The publishing destinations could not be loaded.","action":"Try loading them again. If it still fails, Report this error ID.","step":"Load publishing destinations","discloseDetails":false}],
    ["POST", PEERS, {"message":"The publishing destination operation could not be completed.","action":"Check the result before repeating this operation. Report this error ID.","step":"publishing destination operation","discloseDetails":false}],
    ["PATCH", `${PEERS}/p`, {"message":"The publishing destination save could not be completed.","action":"Check whether your changes were saved before repeating the save. Report this error ID.","step":"Save publishing destination","discloseDetails":false}],
    ["DELETE", `${PEERS}/p`, {"message":"The publishing destination removal could not be confirmed.","action":"Check the list before repeating the removal. Report this error ID.","step":"Remove publishing destination","discloseDetails":false}],
  ] as const) {
    const response = await fetch(`${server}${path}`, { method, headers: { "x-principal": "none" } });
    assert.equal(response.status, 500, `${method} ${path}`);
    assertAdminResponse({ actual: await response.json(), expected: { error: "internal error", code: "INTERNAL_ERROR" } }, { failure });
  }
});

test("POST with no parsed body reads as empty fields and is refused as a validation error", async () => {
  const app = routeApp(registerPublishContentPeerRoutes, routeDeps({ publishContentPeerRepo: new InMemoryPublishContentPeerRepo() }), { json: false });
  const result = await dispatchJsonRequest(app, "POST", PEERS);
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: "'label' is required and must be a non-empty string", code: "VALIDATION_ERROR" });
});

test("PATCH with no parsed body changes nothing and answers the unchanged peer", async () => {
  const keyring = new InMemoryKeyring();
  const repo = new InMemoryPublishContentPeerRepo();
  const deps = routeDeps({ publishContentPeerRepo: repo, siteAssistantSecretSealer: new AesGcmSecretSealer(keyring), siteAssistantSecretKeyring: keyring });
  const created = await dispatchJsonRequest(routeApp(registerPublishContentPeerRoutes, deps), "POST", PEERS, {
    label: "Live", baseUrl: "https://live.example", remoteWorkspaceId: "remote", apiKey: "tovu_live_0123456789abcdef",
  });
  assert.equal(created.status, 201);
  const peer = (created.body as { peer: { id: string } }).peer;
  const patched = await dispatchJsonRequest(routeApp(registerPublishContentPeerRoutes, deps, { json: false }), "PATCH", `${PEERS}/${peer.id}`);
  assert.deepEqual(patched, { status: 200, body: { peer } });
});

test("PATCH forwards each present key and leaves absent ones alone", async () => {
  const keyring = new InMemoryKeyring();
  const repo = new InMemoryPublishContentPeerRepo();
  const deps = routeDeps({ publishContentPeerRepo: repo, siteAssistantSecretSealer: new AesGcmSecretSealer(keyring), siteAssistantSecretKeyring: keyring });
  const app = routeApp(registerPublishContentPeerRoutes, deps);
  const created = await dispatchJsonRequest(app, "POST", PEERS, {
    label: "Live", baseUrl: "https://live.example", remoteWorkspaceId: "remote", apiKey: "tovu_live_0123456789abcdef",
  });
  const id = (created.body as { peer: { id: string } }).peer.id;
  const patched = await dispatchJsonRequest(app, "PATCH", `${PEERS}/${id}`, {
    label: "Staging", baseUrl: "https://staging.example", remoteWorkspaceId: "remote-2", apiKey: "tovu_live_fedcba9876543210",
  });
  assert.equal(patched.status, 200);
  assert.deepEqual(patched.body, { peer: { id, label: "Staging", baseUrl: "https://staging.example", remoteWorkspaceId: "remote-2", masked: "••••3210", hasCredential: true } });
});
