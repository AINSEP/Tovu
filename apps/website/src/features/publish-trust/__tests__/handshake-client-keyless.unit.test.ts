import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
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

test("a null identity response is reported as a non-Tovu destination", async () => {
  await assert.rejects(fetchDestinationIdentity({ httpClient: { send: async () => ({
    status: 200, headers: {}, bodyText: "null",
  }) } }, { baseUrl: "https://dest.example" }),
  (err: unknown) => err instanceof PublishTrustHandshakeError && err.failure === "not-a-tovu-site" &&
    err.message === "dest.example answered, but it does not look like a Tovu site.");
});

test("identity responses require nonempty installation and workspace ids", async () => {
  for (const field of ["installationId", "workspaceId"]) {
    for (const value of [undefined, "", 42]) {
      const body = { installationId: "dest-install", workspaceId: "dest-ws", [field]: value };
      await assert.rejects(fetchDestinationIdentity({ httpClient: { send: async () => ({
        status: 200, headers: {}, bodyText: JSON.stringify(body),
      }) } }, { baseUrl: "https://dest.example" }),
      (err: unknown) => err instanceof PublishTrustHandshakeError && err.failure === "not-a-tovu-site" &&
        err.message === "dest.example answered, but it does not look like a Tovu site.");
    }
  }
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

for (const [leg, fields] of [
  ["challenge", ["nonce", "targetInstallationId"]],
  ["session", ["token"]],
] as const) {
  test(`openPublishSession refuses ${leg} responses with missing, empty or non-string fields`, async () => {
    for (const field of fields) {
      for (const value of [undefined, "", 42]) {
        const responses: Record<string, unknown> = {
          identity: { installationId: "dest-install", workspaceId: "dest-ws" },
          challenge: { nonce: "n", targetInstallationId: "dest-install" },
          session: { token: "session-token" },
        };
        responses[leg] = { ...(responses[leg] as Record<string, unknown>), [field]: value };
        await assert.rejects(openPublishSession({
          keyring: {
            activeKey: async () => assert.fail("the handshake never reads the active key"),
            deriveSigningSecret: async () => assert.fail("the handshake never derives a webhook signing secret"),
            derive: async () => new Uint8Array(32).fill(7),
          },
          httpClient: { send: async request => {
            const path = new URL(request.url).pathname.split("/").at(-1)!;
            assert.ok(Object.hasOwn(responses, path), `unexpected handshake path: ${request.url}`);
            assert.equal(request.url, `https://dest.example/api/publish-trust/v1/${path}`);
            assert.equal(request.method, path === "identity" ? "GET" : "POST");
            return { status: 200, headers: {}, bodyText: JSON.stringify(responses[path]) };
          } },
        }, { baseUrl: "https://dest.example", workspaceId: "source-ws", generation: 2 }),
        (err: unknown) => err instanceof PublishTrustHandshakeError && err.failure === "not-a-tovu-site" &&
          err.message === "dest.example answered, but it does not look like a Tovu site.");
      }
    }
  });
}

test("an invalid destination address is still named in a non-Error transport failure", async () => {
  await assert.rejects(fetchDestinationIdentity({ httpClient: { send: async () => { throw "egress denied"; } } },
    { baseUrl: "invalid-address" }), {
    name: "PublishTrustHandshakeError", failure: "unreachable",
    message: "invalid-address could not be reached: egress denied",
  });
});

test("malformed successful JSON quotes at most 200 response characters", async () => {
  const bodyText = "<html>" + "x".repeat(300);
  await assert.rejects(fetchDestinationIdentity({ httpClient: { send: async () => ({ status: 200, headers: {}, bodyText }) } },
    { baseUrl: "https://dest.example" }), {
    name: "PublishTrustHandshakeError", failure: "not-a-tovu-site",
    message: `dest.example answered, but it does not look like a Tovu site (${bodyText.slice(0, 200)}).`,
  });
});

for (const bodyText of ['"hello"', "42", "[]"]) {
  test(`a successful non-object JSON response ${bodyText} is not a Tovu identity`, async () => {
    await assert.rejects(fetchDestinationIdentity({ httpClient: { send: async () => ({ status: 200, headers: {}, bodyText }) } },
      { baseUrl: "https://dest.example" }), {
      name: "PublishTrustHandshakeError", failure: "not-a-tovu-site",
      message: "dest.example answered, but it does not look like a Tovu site.",
    });
  });
}

for (const bodyText of ["invalid JSON", "null", '"SECRET_STORE_UNCONFIGURED"', '{"code":"OTHER_FAILURE"}']) {
  test(`an unrelated 503 body ${bodyText} uses the generic refusal without quoting the destination`, async () => {
    await assert.rejects(fetchDestinationIdentity({ httpClient: { send: async () => ({ status: 503, headers: {}, bodyText }) } },
      { baseUrl: "https://dest.example" }), {
      name: "PublishTrustHandshakeError", failure: "refused",
      message: "dest.example refused to set up publishing right now. Try again in a moment.",
    });
  });
}

test("an informational HTTP status is refused rather than parsed as an identity", async () => {
  await assert.rejects(fetchDestinationIdentity({ httpClient: { send: async () => ({
    status: 199, headers: {}, bodyText: JSON.stringify({ installationId: "dest", workspaceId: "ws" }),
  }) } }, { baseUrl: "https://dest.example" }), {
    name: "PublishTrustHandshakeError", failure: "refused",
    message: "dest.example refused to set up publishing right now. Try again in a moment.",
  });
});

test("an identity with no string origin falls back to the requested base URL", async () => {
  for (const origin of [undefined, 42]) {
    assert.deepEqual(await fetchDestinationIdentity({ httpClient: { send: async () => ({
      status: 200, headers: {}, bodyText: JSON.stringify({ installationId: "dest", workspaceId: "ws", origin }),
    }) } }, { baseUrl: "https://dest.example" }), {
      installationId: "dest", workspaceId: "ws", origin: "https://dest.example",
    });
  }
});

test("backstop sessions sign the default generation and retain requested capabilities when omitted by the server", async () => {
  const requests: Array<{ url: string; body?: string }> = [];
  const identity = { installationId: "dest", workspaceId: "dest-ws", origin: "https://dest.example" };
  const result = await openPublishSession({
    keyring: {
      activeKey: async () => assert.fail("no raw key read"),
      deriveSigningSecret: async () => assert.fail("no webhook secret"),
      derive: async () => new Uint8Array(32).fill(7),
    },
    httpClient: { send: async request => {
      assert.ok(request.body === undefined || typeof request.body === "string", "handshake requests carry JSON text");
      requests.push({ url: request.url, body: request.body });
      const body = requests.length === 1 ? identity : requests.length === 2
        ? { nonce: "n", targetInstallationId: "dest" } : { token: "session" };
      return { status: 200, headers: {}, bodyText: JSON.stringify(body) };
    } },
  }, { baseUrl: "https://dest.example", workspaceId: "source-ws", backstop: true });
  const capabilities = ["publish_content.read", "publish_content.apply", "publish_content.backstop"];
  assert.deepEqual(result, { token: "session", expiresAt: "", capabilities, identity });
  const signed = JSON.parse(requests[2].body!);
  assert.equal(signed.generation, 1);
  assert.deepEqual(signed.capabilities, capabilities);
  const { createPrivateKey, createPublicKey, verify } = await import("node:crypto");
  const privateKey = createPrivateKey({ key: Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.alloc(32, 7),
  ]), format: "der", type: "pkcs8" });
  const sourceId = Buffer.alloc(16, 7).toString("base64url");
  assert.equal(verify(null, Buffer.from(`tovu-publish-challenge-v1\nn\ndest\n${sourceId}\n1\npublish_content.apply,publish_content.backstop,publish_content.read`),
    createPublicKey(privateKey), Buffer.from(signed.signatureB64u, "base64url")), true);
});

test("a session response keeps string capabilities and drops non-string values", async () => {
  const responses = [
    { installationId: "dest", workspaceId: "ws" },
    { nonce: "n", targetInstallationId: "dest" },
    { token: "session", expiresAt: 42, capabilities: ["publish_content.read", null, 1, "publish_content.apply"] },
  ];
  const result = await openPublishSession({
    keyring: {
      activeKey: async () => assert.fail("no raw key read"),
      deriveSigningSecret: async () => assert.fail("no webhook secret"),
      derive: async () => new Uint8Array(32).fill(7),
    },
    httpClient: { send: async () => ({ status: 200, headers: {}, bodyText: JSON.stringify(responses.shift()) }) },
  }, { baseUrl: "https://dest.example", workspaceId: "source-ws" });
  assert.deepEqual(result.capabilities, ["publish_content.read", "publish_content.apply"]);
  assert.equal(result.expiresAt, "");
});
