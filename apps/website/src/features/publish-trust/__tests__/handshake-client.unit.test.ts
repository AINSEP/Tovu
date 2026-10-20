import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { HttpClientPort } from "#src/platform/http/index";
import type { KeyringPort } from "../../webhooks/index.js";
import { buildChallengeMessage } from "../challenge.js";
import {
  fetchDestinationIdentity,
  openPublishSession,
  PublishTrustHandshakeError,
  type PublishTrustHandshakeFailure,
} from "../handshake-client.js";
import { deriveInstallationId, derivePublishSigningKey, verifyPublishSignature } from "../keys.js";

/**
 * @file Branch-by-branch pins for the SOURCE half of the handshake: every failure class and
 * owner-facing sentence verbatim, the request each leg sends, that a failed leg stops the flow, and
 * that the session leg carries a signature that verifies over the destination's challenge.
 */

type HttpRequest = Parameters<HttpClientPort["send"]>[0];
type HttpResponse = Awaited<ReturnType<HttpClientPort["send"]>>;
type Reply = HttpResponse | Error | string;

const BASE = "https://dest.example";
const WORKSPACE = "ws-src";
const IDENTITY = { installationId: "dest-install", workspaceId: "dest-ws", origin: "https://canonical.example" };
const CHALLENGE = { nonce: "nonce-1", targetInstallationId: "dest-install" };
const MINTED = { token: "tok", expiresAt: "2026-09-19T12:10:00.000Z", capabilities: ["publish_content.read"] };

function ok(body: unknown): HttpResponse {
  return { status: 200, headers: {}, bodyText: typeof body === "string" ? body : JSON.stringify(body) };
}

/** A typed scripted HTTP double: answers each call with the next reply (an Error or string is thrown). */
function scriptedHttp(replies: Reply[]): { httpClient: HttpClientPort; requests: HttpRequest[] } {
  const requests: HttpRequest[] = [];
  const httpClient: HttpClientPort = {
    send: async (request) => {
      requests.push(request);
      const reply = replies.shift();
      if (reply === undefined) throw new Error("unexpected extra request");
      if (reply instanceof Error || typeof reply === "string") throw reply;
      return reply;
    },
  };
  return { httpClient, requests };
}

/** A typed keyring double with deterministic, purpose-separated material. */
const keyring: KeyringPort = {
  activeKey: async () => ({ keyId: "test" }),
  deriveSigningSecret: async () => {
    throw new Error("deriveSigningSecret is not used by the handshake client");
  },
  derive: async ({ workspaceId, purpose, info }) =>
    new Uint8Array(createHash("sha256").update(`${purpose}:${workspaceId}:${info}`).digest()),
};

async function failureOf(promise: Promise<unknown>): Promise<{ failure: PublishTrustHandshakeFailure; message: string }> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof PublishTrustHandshakeError);
    assert.equal(error.name, "PublishTrustHandshakeError");
    return { failure: error.failure, message: error.message };
  }
  throw new Error("expected a PublishTrustHandshakeError");
}

function identityFailure(reply: Reply, baseUrl = BASE) {
  const { httpClient } = scriptedHttp([reply]);
  return failureOf(fetchDestinationIdentity({ httpClient }, { baseUrl }));
}

const NOT_TOVU = { failure: "not-a-tovu-site", message: "dest.example answered, but it does not look like a Tovu site." } as const;
const GENERIC_REFUSAL = { failure: "refused", message: "dest.example refused to set up publishing right now. Try again in a moment." } as const;

test("the identity leg sends a bodiless GET with the handshake timeout", async () => {
  const { httpClient, requests } = scriptedHttp([ok(IDENTITY)]);
  assert.deepEqual(await fetchDestinationIdentity({ httpClient }, { baseUrl: BASE }), IDENTITY);
  assert.deepEqual(requests, [{ method: "GET", url: `${BASE}/api/publish-trust/v1/identity`, headers: {}, timeoutMs: 15_000 }]);
});

test("a transport Error is unreachable and quotes the transport message", async () => {
  assert.deepEqual(await identityFailure(new Error("ECONNREFUSED")), {
    failure: "unreachable",
    message: "dest.example could not be reached: ECONNREFUSED",
  });
});

test("a thrown non-Error is unreachable and quoted through String()", async () => {
  assert.deepEqual(await identityFailure("egress denied"), { failure: "unreachable", message: "dest.example could not be reached: egress denied" });
});

test("an unparsable base URL is named whole", async () => {
  assert.deepEqual(await identityFailure(new Error("x"), "not a url"), { failure: "unreachable", message: "not a url could not be reached: x" });
});

test("404 is not a Tovu site and says to check the address", async () => {
  assert.deepEqual(await identityFailure({ status: 404, headers: {}, bodyText: "{}" }), {
    failure: "not-a-tovu-site",
    message: "dest.example answered, but it does not look like a Tovu site. Check the address.",
  });
});

test("401 is not-connected and names connect-then-deploy", async () => {
  assert.deepEqual(await identityFailure({ status: 401, headers: {}, bodyText: "{}" }), {
    failure: "not-connected",
    message: "dest.example doesn't recognise this computer yet. Connect it, then deploy the site once.",
  });
});

test("503 carrying the missing-site-key code names the Site key as the fix", async () => {
  assert.deepEqual(await identityFailure({ status: 503, headers: {}, bodyText: '{"code":"SECRET_STORE_UNCONFIGURED"}' }), {
    failure: "refused",
    message: "dest.example has no Site key set up yet, so it cannot accept publishes. Set one up on that site, then try again.",
  });
});

test("a 500 carrying the missing-site-key code is still the generic refusal", async () => {
  assert.deepEqual(await identityFailure({ status: 500, headers: {}, bodyText: '{"code":"SECRET_STORE_UNCONFIGURED"}' }), GENERIC_REFUSAL);
});

for (const bodyText of ["not json", "null", "{}"]) {
  test(`503 with body ${bodyText} is the generic refusal`, async () => {
    assert.deepEqual(await identityFailure({ status: 503, headers: {}, bodyText }), GENERIC_REFUSAL);
  });
}

for (const status of [199, 300, 302, 500]) {
  test(`status ${status} is the generic refusal`, async () => {
    assert.deepEqual(await identityFailure({ status, headers: {}, bodyText: JSON.stringify(IDENTITY) }), GENERIC_REFUSAL);
  });
}

test("status 299 is a success", async () => {
  const { httpClient } = scriptedHttp([{ status: 299, headers: {}, bodyText: JSON.stringify(IDENTITY) }]);
  assert.deepEqual(await fetchDestinationIdentity({ httpClient }, { baseUrl: BASE }), IDENTITY);
});

test("a non-JSON success quotes the first 200 body characters", async () => {
  const bodyText = `<html>${"x".repeat(300)}`;
  assert.deepEqual(await identityFailure(ok(bodyText)), {
    failure: "not-a-tovu-site",
    message: `dest.example answered, but it does not look like a Tovu site (${bodyText.slice(0, 200)}).`,
  });
});

for (const bodyText of ["null", "[]", "7", '"text"']) {
  test(`a success with JSON ${bodyText} is not a Tovu site`, async () => {
    assert.deepEqual(await identityFailure(ok(bodyText)), NOT_TOVU);
  });
}

for (const body of [{ ...IDENTITY, installationId: "" }, { ...IDENTITY, installationId: 1 }, { ...IDENTITY, workspaceId: "" }, { installationId: "i" }]) {
  test(`identity ${JSON.stringify(body)} is not a Tovu site`, async () => {
    assert.deepEqual(await identityFailure(ok(body)), NOT_TOVU);
  });
}

test("an identity without a string origin falls back to the base URL", async () => {
  const { httpClient } = scriptedHttp([ok({ ...IDENTITY, origin: 5 })]);
  assert.deepEqual(await fetchDestinationIdentity({ httpClient }, { baseUrl: BASE }), { ...IDENTITY, origin: BASE });
});

test("a failed identity leg stops the session flow before the challenge", async () => {
  const { httpClient, requests } = scriptedHttp([{ status: 401, headers: {}, bodyText: "" }]);
  const failure = await failureOf(openPublishSession({ httpClient, keyring }, { baseUrl: BASE, workspaceId: WORKSPACE }));
  assert.equal(failure.failure, "not-connected");
  assert.equal(requests.length, 1);
});

for (const challenge of [{}, { ...CHALLENGE, nonce: "" }, { ...CHALLENGE, nonce: 1 }, { ...CHALLENGE, targetInstallationId: "" }, { nonce: "n" }]) {
  test(`challenge ${JSON.stringify(challenge)} is not a Tovu site and sends no session request`, async () => {
    const { httpClient, requests } = scriptedHttp([ok(IDENTITY), ok(challenge)]);
    assert.deepEqual(await failureOf(openPublishSession({ httpClient, keyring }, { baseUrl: BASE, workspaceId: WORKSPACE })), NOT_TOVU);
    assert.equal(requests.length, 2);
  });
}

for (const minted of [{}, { token: "" }, { token: 9 }]) {
  test(`session response ${JSON.stringify(minted)} is not a Tovu site`, async () => {
    const { httpClient } = scriptedHttp([ok(IDENTITY), ok(CHALLENGE), ok(minted)]);
    assert.deepEqual(await failureOf(openPublishSession({ httpClient, keyring }, { baseUrl: BASE, workspaceId: WORKSPACE })), NOT_TOVU);
  });
}

test("a challenge-leg 401 surfaces as not-connected", async () => {
  const { httpClient } = scriptedHttp([ok(IDENTITY), { status: 401, headers: {}, bodyText: "" }]);
  const failure = await failureOf(openPublishSession({ httpClient, keyring }, { baseUrl: BASE, workspaceId: WORKSPACE }));
  assert.equal(failure.failure, "not-connected");
});

test("the challenge and session legs POST JSON with a content-type header", async () => {
  const { httpClient, requests } = scriptedHttp([ok(IDENTITY), ok(CHALLENGE), ok(MINTED)]);
  await openPublishSession({ httpClient, keyring }, { baseUrl: BASE, workspaceId: WORKSPACE });
  assert.deepEqual(requests[1], {
    method: "POST",
    url: `${BASE}/api/publish-trust/v1/challenge`,
    headers: { "content-type": "application/json" },
    body: "{}",
    timeoutMs: 15_000,
  });
  assert.equal(requests[2].url, `${BASE}/api/publish-trust/v1/session`);
  assert.deepEqual(requests[2].headers, { "content-type": "application/json" });
});

test("the session leg carries a generation-1 signature over the destination's challenge", async () => {
  const { httpClient, requests } = scriptedHttp([ok(IDENTITY), ok(CHALLENGE), ok(MINTED)]);
  await openPublishSession({ httpClient, keyring }, { baseUrl: BASE, workspaceId: WORKSPACE });
  const body = JSON.parse(String(requests[2].body));
  const sourceInstallationId = await deriveInstallationId({ keyring, workspaceId: WORKSPACE });
  const capabilities = ["publish_content.read", "publish_content.apply"];
  assert.deepEqual({ ...body, signatureB64u: "-" }, { nonce: "nonce-1", sourceInstallationId, generation: 1, capabilities, signatureB64u: "-" });

  const key = await derivePublishSigningKey({ keyring, workspaceId: WORKSPACE, sourceInstallationId, targetOrigin: BASE, generation: 1 });
  const message = buildChallengeMessage({ ...CHALLENGE, sourceInstallationId, generation: 1, capabilities });
  assert.equal(verifyPublishSignature({ publicKeyB64u: key.publicKeyB64u, message, signatureB64u: body.signatureB64u }), true);
});

test("an explicit generation and backstop flow into the signed session request", async () => {
  const { httpClient, requests } = scriptedHttp([ok(IDENTITY), ok(CHALLENGE), ok(MINTED)]);
  await openPublishSession({ httpClient, keyring }, { baseUrl: BASE, workspaceId: WORKSPACE, generation: 4, backstop: true });
  const body = JSON.parse(String(requests[2].body));
  assert.equal(body.generation, 4);
  assert.deepEqual(body.capabilities, ["publish_content.read", "publish_content.apply", "publish_content.backstop"]);
});

test("the returned session carries the token, expiry, server capabilities and identity", async () => {
  const { httpClient } = scriptedHttp([ok(IDENTITY), ok(CHALLENGE), ok(MINTED)]);
  assert.deepEqual(await openPublishSession({ httpClient, keyring }, { baseUrl: BASE, workspaceId: WORKSPACE }), {
    token: "tok",
    expiresAt: MINTED.expiresAt,
    capabilities: ["publish_content.read"],
    identity: IDENTITY,
  });
});

test("a non-string expiry becomes empty and non-array capabilities fall back to the requested ones", async () => {
  const { httpClient } = scriptedHttp([ok(IDENTITY), ok(CHALLENGE), ok({ token: "tok", expiresAt: 5, capabilities: "all" })]);
  const session = await openPublishSession({ httpClient, keyring }, { baseUrl: BASE, workspaceId: WORKSPACE });
  assert.equal(session.expiresAt, "");
  assert.deepEqual(session.capabilities, ["publish_content.read", "publish_content.apply"]);
});

test("server capabilities keep only string entries", async () => {
  const { httpClient } = scriptedHttp([ok(IDENTITY), ok(CHALLENGE), ok({ token: "tok", capabilities: ["publish_content.read", 3, null] })]);
  const session = await openPublishSession({ httpClient, keyring }, { baseUrl: BASE, workspaceId: WORKSPACE });
  assert.deepEqual(session.capabilities, ["publish_content.read"]);
});
