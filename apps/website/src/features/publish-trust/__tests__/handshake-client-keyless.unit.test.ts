import assert from "node:assert/strict";
import test from "node:test";

import { fetchDestinationIdentity, openPublishSession, PublishTrustHandshakeError } from "../handshake-client.js";

// A destination with no site key answers every handshake route with a typed 503. The owner must
// read what to fix on that site, not "try again in a moment", which no retry will ever satisfy.
test("a destination without a Site key is named as the thing to fix", async () => {
  const requests: unknown[] = [];
  const httpClient = {
    send: async (request: unknown) => { requests.push(request); return ({
      status: 503,
      headers: {},
      bodyText: JSON.stringify({ error: "whatever the destination says", code: "SECRET_STORE_UNCONFIGURED" }),
    }); },
  };

  await assert.rejects(
    fetchDestinationIdentity({ httpClient: httpClient as never }, { baseUrl: "https://dest.example" }),
    (err: unknown) => {
      assert.ok(err instanceof PublishTrustHandshakeError);
      assert.equal(err.failure, "refused");
      assert.equal(
        err.message,
        "dest.example has no Site key set up yet, so it cannot accept publishes. Set one up on that site, then try again."
      );
      return true;
    }
  );
  assert.deepEqual(requests, [{ method: "GET", url: "https://dest.example/api/publish-trust/v1/identity", headers: {}, timeoutMs: 15000 }]);
});

test("identity decoding returns the destination's workspace and origin", async () => {
  const identity = { installationId: "dest-install", workspaceId: "dest-ws", origin: "https://canonical.example" };
  const requests: unknown[] = [];
  assert.deepEqual(await fetchDestinationIdentity({ httpClient: { send: async request => {
    requests.push(request);
    return { status: 200, headers: {}, bodyText: JSON.stringify(identity) };
  } } }, { baseUrl: "https://dest.example" }), identity);
  assert.deepEqual(requests, [{ method: "GET", url: "https://dest.example/api/publish-trust/v1/identity", headers: {}, timeoutMs: 15000 }]);
});

for (const [status, failure] of [[404, "not-a-tovu-site"], [401, "not-connected"], [500, "refused"]] as const) {
  test(`identity HTTP ${status} becomes ${failure}`, async () => {
    await assert.rejects(fetchDestinationIdentity({ httpClient: { send: async () => ({
      status, headers: {}, bodyText: "{}",
    }) } }, { baseUrl: "https://dest.example" }),
    (err: unknown) => err instanceof PublishTrustHandshakeError && err.failure === failure);
  });
}

test("a transport timeout is translated to an unreachable handshake error", async () => {
  await assert.rejects(fetchDestinationIdentity({ httpClient: { send: async () => { throw new Error("timed out"); } } },
    { baseUrl: "https://dest.example" }),
    (err: unknown) => err instanceof PublishTrustHandshakeError && err.failure === "unreachable" &&
      err.message === "dest.example could not be reached: timed out");
});

test("openPublishSession signs the challenge and returns the minted session", async () => {
  const { createPrivateKey, createPublicKey, verify } = await import("node:crypto");
  const seed = new Uint8Array(32).fill(7);
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(seed)]), format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  const identity = { installationId: "dest-install", workspaceId: "dest-ws", origin: "https://dest.example" };
  const requests: Array<{ method: string; url: string; body?: string; headers: unknown; timeoutMs?: number }> = [];
  const sourceId = Buffer.from(seed.slice(0, 16)).toString("base64url");
  const keyRequests: unknown[] = [];
  const result = await openPublishSession({
    keyring: {
      activeKey: async () => assert.fail("the handshake never reads the active key"),
      deriveSigningSecret: async () => assert.fail("the handshake never derives a webhook signing secret"),
      derive: async input => { keyRequests.push(input); return seed; },
    },
    httpClient: { send: async request => {
      requests.push(request as typeof requests[number]);
      const response = requests.length === 1 ? identity : requests.length === 2
        ? { nonce: "nonce-under-test", targetInstallationId: "dest-install" }
        : { token: "session-under-test", expiresAt: "2026-10-03T12:05:00Z", capabilities: ["publish_content.apply"] };
      return { status: 200, headers: {}, bodyText: JSON.stringify(response) };
    } },
  }, { baseUrl: "https://dest.example", workspaceId: "source-ws", generation: 2 });
  assert.deepEqual(requests.map(r => [r.method, r.url, r.headers, r.timeoutMs]), [
    ["GET", "https://dest.example/api/publish-trust/v1/identity", {}, 15000],
    ["POST", "https://dest.example/api/publish-trust/v1/challenge", { "content-type": "application/json" }, 15000],
    ["POST", "https://dest.example/api/publish-trust/v1/session", { "content-type": "application/json" }, 15000],
  ]);
  assert.equal(requests[0].body, undefined);
  assert.equal(requests[1].body, "{}");
  const signed = JSON.parse(requests[2].body!);
  assert.deepEqual(Object.keys(signed).sort(), ["capabilities", "generation", "nonce", "signatureB64u", "sourceInstallationId"]);
  assert.equal(signed.sourceInstallationId, sourceId);
  assert.equal(signed.nonce, "nonce-under-test");
  assert.equal(signed.generation, 2);
  assert.deepEqual(signed.capabilities, ["publish_content.read", "publish_content.apply"]);
  assert.deepEqual(result, { token: "session-under-test", expiresAt: "2026-10-03T12:05:00Z", capabilities: ["publish_content.apply"], identity });
  // The literal wire message is checked independently of the client's message-builder.
  assert.equal(verify(null, Buffer.from(`tovu-publish-challenge-v1\nnonce-under-test\ndest-install\n${sourceId}\n2\npublish_content.apply,publish_content.read`), publicKey, Buffer.from(signed.signatureB64u, "base64url")), true);
  assert.equal(keyRequests.length, 2);
});
